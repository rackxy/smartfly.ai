import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
await loadEnv(path.join(root,'.env'));
const port=Number(process.env.PORT)||3000;
const providerEnvironment=()=>process.env.AMADEUS_ENV==='test'?'test':'production';
const providerBase=()=>providerEnvironment()==='production'?'https://api.amadeus.com':'https://test.api.amadeus.com';
const staticTypes={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
let cachedToken=null,tokenExpiresAt=0;

function loadEnv(file){
  return readFile(file,'utf8').then(source=>{for(const line of source.split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'')}}).catch(()=>{});
}
function send(res,status,body){res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body))}
async function readJson(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>16_384)throw Object.assign(new Error('Request body too large.'),{status:413})}try{return JSON.parse(body)}catch{throw Object.assign(new Error('Send a valid JSON search request.'),{status:400})}}
function validDate(value){return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))}
async function getToken(base){
  if(cachedToken&&Date.now()<tokenExpiresAt)return cachedToken;
  const id=process.env.AMADEUS_CLIENT_ID,secret=process.env.AMADEUS_CLIENT_SECRET;
  if(!id||!secret)throw Object.assign(new Error('Provider search is not configured. Add AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET to the server .env file.'),{status:503});
  const form=new URLSearchParams({grant_type:'client_credentials',client_id:id,client_secret:secret});
  const response=await fetch(`${base}/v1/security/oauth2/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(15000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok||!payload.access_token)throw Object.assign(new Error('Provider authentication failed. Check the Amadeus API credentials and environment.'),{status:502});
  cachedToken=payload.access_token;tokenExpiresAt=Date.now()+Math.max(30,(Number(payload.expires_in)||1800)-60)*1000;return cachedToken;
}
async function amadeusGet(base,token,pathname,params){
  const url=new URL(pathname,base);for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null&&value!=='')url.searchParams.set(key,String(value));
  const response=await fetch(url,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok){const issue=payload.errors?.[0];const message=issue?.detail||issue?.title||'The hotel provider could not complete this search.';throw Object.assign(new Error(message),{status:response.status===429?429:502})}
  return payload;
}
async function hotelSearch(body){
  const destination=String(body.destination||'').trim(),checkInDate=body.checkInDate,checkOutDate=body.checkOutDate;
  const adults=Number(body.adults),rooms=Number(body.rooms),countryCode=String(body.countryCode||'').toUpperCase();
  if(destination.length<3||destination.length>100)throw Object.assign(new Error('Enter a destination between 3 and 100 characters.'),{status:400});
  if(!validDate(checkInDate)||!validDate(checkOutDate)||checkOutDate<=checkInDate)throw Object.assign(new Error('Choose valid check-in and check-out dates.'),{status:400});
  if(!Number.isInteger(adults)||adults<1||adults>9||!Number.isInteger(rooms)||rooms<1||rooms>4)throw Object.assign(new Error('Choose 1–9 adults and 1–4 rooms.'),{status:400});
  if(countryCode&&!/^[A-Z]{2}$/.test(countryCode))throw Object.assign(new Error('Invalid country code.'),{status:400});
  const base=providerBase();
  const token=await getToken(base);
  // Amadeus City Search accepts keywords from 3 to 10 characters.
  const cityKeyword=destination.replace(/[^a-zA-Z ]/g,'').trim().slice(0,10);
  if(cityKeyword.length<3)throw Object.assign(new Error('Enter at least three letters for the destination city.'),{status:400});
  const cityResults=await amadeusGet(base,token,'/v1/reference-data/locations/cities',{keyword:cityKeyword,max:10,countryCode:countryCode||undefined});
  const candidates=cityResults.data||[];
  const city=candidates.find(item=>item.name?.toLowerCase()===destination.toLowerCase())||candidates[0];
  if(!city?.geoCode?.latitude||!city?.geoCode?.longitude)throw Object.assign(new Error(`No mapped city location was found for “${destination}”. Try a nearby major city.`),{status:404});
  const hotelList=await amadeusGet(base,token,'/v1/reference-data/locations/hotels/by-geocode',{latitude:city.geoCode.latitude,longitude:city.geoCode.longitude,radius:10,radiusUnit:'KM',hotelSource:'ALL'});
  const hotels=(hotelList.data||[]).filter(h=>h.hotelId).slice(0,20);
  if(!hotels.length)return {provider:'Amadeus',environment:providerEnvironment(),city:city.name,results:[]};
  const offersResponse=await amadeusGet(base,token,'/v3/shopping/hotel-offers',{
    hotelIds:hotels.map(h=>h.hotelId).join(','),adults,checkInDate,checkOutDate,roomQuantity:rooms,currency:'INR',bestRateOnly:true
  });
  const hotelById=new Map(hotels.map(h=>[h.hotelId,h]));
  const results=(offersResponse.data||[]).flatMap(item=>{
    const hotel=hotelById.get(item.hotel?.hotelId)||item.hotel||{};
    return (item.offers||[]).map(offer=>({
      hotelId:hotel.hotelId||item.hotel?.hotelId,name:hotel.name||item.hotel?.name||'Hotel',chainCode:hotel.chainCode||item.hotel?.chainCode||'',
      city:city.name,countryCode:hotel.address?.countryCode||city.address?.countryCode||'',address:hotel.address||{},latitude:hotel.geoCode?.latitude||item.hotel?.latitude||null,longitude:hotel.geoCode?.longitude||item.hotel?.longitude||null,cityLatitude:city.geoCode.latitude,cityLongitude:city.geoCode.longitude,
      category:hotel.category||hotel.rating||'',offerId:offer.id,checkInDate:offer.checkInDate,checkOutDate:offer.checkOutDate,roomQuantity:Number(offer.roomQuantity)||rooms,
      room:offer.room||{},price:offer.price||{},policies:offer.policies||{},boardType:offer.boardType||'',
    }));
  }).filter(result=>Number.isFinite(Number(result.price.total))).sort((a,b)=>Number(a.price.total)-Number(b.price.total));
  return {provider:'Amadeus',environment:providerEnvironment(),city:city.name,results};
}
function minutes(isoDuration=''){const hour=Number(isoDuration.match(/(\d+)H/)?.[1]||0),minute=Number(isoDuration.match(/(\d+)M/)?.[1]||0);return hour*60+minute}
async function findFlightLocation(base,token,query){
  const keyword=String(query||'').trim().split(/\s+/)[0].replace(/[^a-zA-Z0-9]/g,'').slice(0,10);
  if(keyword.length<2)throw Object.assign(new Error('Enter a city or airport name with at least two letters.'),{status:400});
  const found=await amadeusGet(base,token,'/v1/reference-data/locations',{subType:'CITY,AIRPORT',keyword,max:10});
  const locations=found.data||[],normalized=String(query).trim().toLowerCase();
  const exact=locations.find(loc=>loc.name?.toLowerCase()===normalized)||locations.find(loc=>loc.iataCode?.toLowerCase()===normalized);
  const location=exact||locations.find(loc=>loc.subType?.toUpperCase()==='CITY')||locations[0];
  if(!location?.iataCode)throw Object.assign(new Error(`Could not match “${query}” to an airport or city code.`),{status:404});
  return {code:location.iataCode,name:location.name||query};
}
async function flightSearch(body){
  const origin=String(body.origin||'').trim(),destination=String(body.destination||'').trim(),departureDate=body.departureDate,returnDate=body.returnDate||undefined;
  const adults=Number(body.adults),cabin=String(body.cabin||'ECONOMY').toUpperCase(),supportedCabins=['ECONOMY','PREMIUM_ECONOMY','BUSINESS','FIRST'];
  if(origin.length<2||destination.length<2)throw Object.assign(new Error('Enter both a departure and destination city.'),{status:400});
  if(!validDate(departureDate)||returnDate&&(!validDate(returnDate)||returnDate<departureDate))throw Object.assign(new Error('Choose valid flight dates.'),{status:400});
  if(!Number.isInteger(adults)||adults<1||adults>9||!supportedCabins.includes(cabin))throw Object.assign(new Error('Choose 1–9 adults and a supported cabin class.'),{status:400});
  const base=providerBase(),token=await getToken(base);
  const [from,to]=await Promise.all([findFlightLocation(base,token,origin),findFlightLocation(base,token,destination)]);
  if(from.code===to.code)throw Object.assign(new Error('Origin and destination resolved to the same airport or city.'),{status:400});
  const params={originLocationCode:from.code,destinationLocationCode:to.code,departureDate,returnDate,adults,travelClass:cabin,currencyCode:'INR',max:50};
  const payload=await amadeusGet(base,token,'/v2/shopping/flight-offers',params),carriers=payload.dictionaries?.carriers||{};
  const carrierNames={AI:'Air India',IX:'Air India Express','6E':'IndiGo',QP:'Akasa Air',SG:'SpiceJet','9I':'Alliance Air',S5:'Star Air',IC:'Fly91',I7:'IndiaOne Air',EK:'Emirates',FZ:'flydubai',QR:'Qatar Airways',EY:'Etihad Airways',SQ:'Singapore Airlines',TG:'Thai Airways',BA:'British Airways',LH:'Lufthansa',AF:'Air France',KL:'KLM',VS:'Virgin Atlantic',CX:'Cathay Pacific',MH:'Malaysia Airlines',TK:'Turkish Airlines',G9:'Air Arabia',WY:'Oman Air',SV:'Saudia',KU:'Kuwait Airways',GF:'Gulf Air',JL:'Japan Airlines',NH:'All Nippon Airways',UA:'United Airlines',DL:'Delta Air Lines',AA:'American Airlines',AC:'Air Canada',QF:'Qantas'};
  const results=(payload.data||[]).map(offer=>{
    const outbound=offer.itineraries?.[0],inbound=offer.itineraries?.[1],segments=outbound?.segments||[],first=segments[0],last=segments.at(-1),carrierCodes=offer.validatingAirlineCodes||[first?.carrierCode].filter(Boolean),carrier=carrierCodes[0]||'';
    const baggage=offer.travelerPricings?.[0]?.fareDetailsBySegment?.map(item=>item.includedCheckedBags?.quantity).find(value=>value!==undefined);
    const flightCarrier=first?.carrierCode||carrier;
    return {id:offer.id,price:Number(offer.price?.grandTotal||offer.price?.total),currency:offer.price?.currency||'INR',base:Number(offer.price?.base||0),taxes:(offer.price?.taxes||[]).reduce((sum,tax)=>sum+(Number(tax.amount)||0),0),airlineCode:flightCarrier,airline:carrierNames[flightCarrier]||carriers[flightCarrier]||flightCarrier||'Airline',flightNumbers:segments.map(segment=>`${segment.carrierCode||''} ${segment.number||''}`.trim()),departure:{at:first?.departure?.at||'',airport:first?.departure?.iataCode||from.code},arrival:{at:last?.arrival?.at||'',airport:last?.arrival?.iataCode||to.code},returnDeparture:inbound?.segments?.[0]?.departure?.at||'',returnArrival:inbound?.segments?.at(-1)?.arrival?.at||'',durationMinutes:minutes(outbound?.duration),stops:Math.max(0,segments.length-1),baggageQuantity:baggage??null,roomCabin:offer.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.cabin||cabin,source:'Amadeus',validatingAirlineCodes:carrierCodes};
  }).filter(result=>Number.isFinite(result.price)).sort((a,b)=>a.price-b.price);
  let priceInsight=null;
  const daysUntilDeparture=Math.ceil((Date.parse(`${departureDate}T00:00:00Z`)-Date.now())/86400000);
  let priceInsightMessage=daysUntilDeparture>90?'Historical fare guidance is available for departure dates up to 90 days ahead.':daysUntilDeparture<0?'Historical fare guidance is not available for past departure dates.':'Historical fare benchmark unavailable for this route/date.';
  if(daysUntilDeparture>=0&&daysUntilDeparture<=90){
    try{
      const insight=await amadeusGet(base,token,'/v1/analytics/itinerary-price-metrics',{originIataCode:from.code,destinationIataCode:to.code,departureDate,currencyCode:'INR',oneWay:!returnDate});
      const metric=insight.data?.[0];
      if(metric?.priceMetrics?.length){priceInsight={currency:metric.currencyCode||'INR',departureDate:metric.departureDate,metrics:metric.priceMetrics.map(item=>({amount:Number(item.amount),rank:item.quartileRanking})).filter(item=>Number.isFinite(item.amount))};priceInsightMessage='';}
    }catch{ /* Historical benchmarks are optional; keep live offers available if this API is unavailable. */ }
  }
  return {provider:'Amadeus',environment:providerEnvironment(),origin:from,destination:to,results,priceInsight,priceInsightMessage};
}
async function serveStatic(req,res,url){
  const pathname=decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname);
 if(!new Set(['/index.html','/app.js','/styles.css','/login.html']).has(pathname)){res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});return res.end('Not found')}
  const target=path.resolve(root,`.${pathname}`);
  if(target!==root&&!target.startsWith(`${root}${path.sep}`)){res.writeHead(403);return res.end('Forbidden')}
  try{const data=await readFile(target);res.writeHead(200,{'content-type':staticTypes[path.extname(target)]||'application/octet-stream','x-content-type-options':'nosniff'});res.end(data)}catch{res.writeHead(404,{'content-type':'text/plain; charset=utf-8'});res.end('Not found')}
}
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(req.method==='POST'&&url.pathname==='/api/hotels/search'){
    try{send(res,200,await hotelSearch(await readJson(req)))}catch(error){send(res,error.status||502,{error:error.message||'Hotel search failed.'})}return;
  }
  if(req.method==='POST'&&url.pathname==='/api/flights/search'){
    try{send(res,200,await flightSearch(await readJson(req)))}catch(error){send(res,error.status||502,{error:error.message||'Flight search failed.'})}return;
  }
  if(req.method==='GET'||req.method==='HEAD')return serveStatic(req,res,url);
  send(res,405,{error:'Method not allowed.'});
});
server.listen(port,'0.0.0.0',()=>console.log(`SmartFly is running on port ${port}`));