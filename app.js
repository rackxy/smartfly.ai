/* Live provider requests are sent through server.js; credentials stay server-side. */
let tripType='round';
let matchPriority='price';
let currentOffers=[];
let currentPriceInsight=null;
let currentPriceInsightMessage='';
let flightSearchState='idle',flightSearchError='';
let selectedDemoBooking=null;
let selectedBookingMode='flight';
let selectedBookingItem=null;
let selectedPaymentMethod='gpay';
const WELCOME_OFFER_KEY='smartfly_first_time_offer_used';
const $=id=>document.getElementById(id);
const USER_STORAGE_KEY='smartfly_user';

function getStoredUser(){
  try{
    const stored=localStorage.getItem(USER_STORAGE_KEY);
    return stored?JSON.parse(stored):null;
  }catch(error){
    return null;
  }
}

function showToast(message,type='info'){
  const toast=$('toast-notice') || document.createElement('div');
  if(!$('toast-notice')){
    toast.id='toast-notice';
    toast.className='toast-notice';
    toast.setAttribute('role','status');
    toast.setAttribute('aria-live','polite');
    document.body.appendChild(toast);
  }
  toast.textContent=message;
  toast.className=`toast-notice show ${type==='success'?'toast-success':type==='error'?'toast-error':''}`.trim();
  clearTimeout(showToast.timeoutId);
  showToast.timeoutId=setTimeout(()=>{
    toast.className='toast-notice';
  },3500);
}

function updateTopbarAuth(){
  const link=$('topbar-login-link');
  if(!link)return;
  const user=getStoredUser();
  if(!user){
    link.href='login.html';
    link.textContent='✦ Sign in';
    link.classList.remove('user-pill');
    return;
  }
  link.href='login.html';
  link.textContent=`✦ ${user.phone}`;
  link.classList.add('user-pill');
}

function requireAuth(action='continue'){
  const user=getStoredUser();
  if(user) return true;
  showToast('Please sign in before you can continue to passenger details or payment.', 'error');
  const redirect=encodeURIComponent(window.location.href);
  window.location.href=`login.html?redirect=${redirect}`;
  return false;
}
const today=new Date();
const asDate=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const departure=new Date(today);departure.setDate(today.getDate()+14);
const returning=new Date(departure);returning.setDate(departure.getDate()+5);
$('depart').min=asDate(today);$('depart').value=asDate(departure);$('return').min=asDate(departure);$('return').value=asDate(returning);

function cityCode(city){const known={delhi:'DEL',mumbai:'BOM',bengaluru:'BLR',bangalore:'BLR',hyderabad:'HYD',chennai:'MAA',kolkata:'CCU',pune:'PNQ',goa:'GOI',jaipur:'JAI',ahmedabad:'AMD',kochi:'COK',guwahati:'GAU',patna:'PAT',raipur:'RPR',panaji:'GOI',chandigarh:'IXC',shimla:'SLV',ranchi:'IXR',bhopal:'BHO',imphal:'IMF',shillong:'SHL',aizawl:'AJL',kohima:'DMU',bhubaneswar:'BBI',gangtok:'PYG',agartala:'IXA',lucknow:'LKO',dehradun:'DED',port:'IXZ',srinagar:'SXR',leh:'IXL',puducherry:'PNY','new delhi':'DEL',amritsar:'ATQ',agra:'AGR',prayagraj:'IXD',dimapur:'DMU',lilabari:'IXI',mopa:'GOX',dabolim:'GOI',hubballi:'HBX',varanasi:'VNS',ayodhya:'AYJ',jammu:'IXJ',bagdogra:'IXB',dibrugarh:'DIB',jorhat:'JRH',silchar:'IXS',indore:'IDR',nagpur:'NAG',aurangabad:'IXU',sambhajinagar:'IXU',nashik:'ISK',rajkot:'HSR',hubli:'HBX',belgaum:'IXG',mangalore:'IXE',mangaluru:'IXE',tiruchirappalli:'TRZ',madurai:'IXM',coimbatore:'CJB',vijayawada:'VGA',tirupati:'TIR',rajahmundry:'RJA',kadapa:'CDP',kannur:'CNN',calicut:'CCJ',kozhikode:'CCJ',bikaner:'BKB',jodhpur:'JDH',udaipur:'UDR',jaisalmer:'JSA',jabalpur:'JLR',gwalior:'GWL',surat:'STV',gaya:'GAY',darbhanga:'DBR',newark:'EWR',london:'LON',paris:'PAR',singapore:'SIN',dubai:'DXB',toronto:'YTO',sydney:'SYD',auckland:'AKL',berlin:'BER',rome:'ROM',madrid:'MAD',amsterdam:'AMS',zurich:'ZRH',tokyo:'TYO',seoul:'SEL',bangkok:'BKK',jakarta:'JKT',manila:'MNL',colombo:'CMB',kathmandu:'KTM',dhaka:'DAC',karachi:'KHI',doha:'DOH',riyadh:'RUH',istanbul:'IST',cairo:'CAI',nairobi:'NBO',johannesburg:'JNB',sao:'SAO',mexico:'MEX',buenos:'BUE'};return known[city.trim().toLowerCase()]||city.trim().slice(0,3).toUpperCase()||'---'}
function formatDate(value){if(!value)return 'Select date';return new Date(`${value}T12:00:00`).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
function money(n){return '\u20B9'+Math.round(n).toLocaleString('en-IN')}
function search(){
  const origin=$('origin').value.trim(),destination=$('destination').value.trim();
  if(!origin||!destination)return;
  const travelers=Number($('travelers').value);
  $('origin-code').textContent=cityCode(origin);$('destination-code').textContent=cityCode(destination);
  $('results-title').textContent=`SmartFly AI flight prices from ${origin} to ${destination}`;
  $('results-subtitle').textContent=`${formatDate($('depart').value)}${tripType==='round'&&$('return').value?' – '+formatDate($('return').value):''} · ${travelers} traveler${travelers>1?'s':''} · Illustrative prices for comparison`;
  currentOffers=[];renderOffers();renderHotels();
}function updateFlightNotice(){
  const notice=$('flight-notice-copy');
  if(flightSearchState==='loading')notice.innerHTML='<b>Preparing SmartFly AI prices</b> for your route...';
  else if(flightSearchState==='preview')notice.innerHTML='<b>SmartFly AI price preview</b> — illustrative fares and schedules only. No live flight search, booking, or payment.';
  else if(flightSearchState==='stale')notice.innerHTML='<b>Search details changed</b> — search again to refresh the illustrative prices.';
  else notice.innerHTML='<b>SmartFly AI flight prices</b> — illustrative estimates for comparing airlines; not live fares or bookable flights.';
}
function invalidateFlightSearch(){
  if(flightSearchState==='preview'){flightSearchState='stale';currentOffers=[];updatePriceOutlook();renderOffers();updateFlightNotice()}
}
const INDIAN_CITIES_SET = new Set([
  'delhi', 'new delhi', 'mumbai', 'bombay', 'bengaluru', 'bangalore', 'hyderabad', 'chennai', 'madras', 'kolkata', 'calcutta',
  'pune', 'goa', 'panaji', 'mopa', 'dabolim', 'jaipur', 'ahmedabad', 'kochi', 'cochin', 'guwahati', 'patna', 'raipur',
  'chandigarh', 'shimla', 'ranchi', 'bhopal', 'imphal', 'shillong', 'aizawl', 'kohima', 'bhubaneswar', 'gangtok', 'agartala',
  'lucknow', 'dehradun', 'port blair', 'srinagar', 'leh', 'puducherry', 'pondicherry', 'amritsar', 'agra', 'prayagraj',
  'allahabad', 'varanasi', 'ayodhya', 'jammu', 'bagdogra', 'dibrugarh', 'jorhat', 'silchar', 'indore', 'nagpur',
  'aurangabad', 'sambhajinagar', 'nashik', 'rajkot', 'hubli', 'hubballi', 'belgaum', 'mangalore', 'mangaluru',
  'tiruchirappalli', 'trichy', 'madurai', 'coimbatore', 'vijayawada', 'tirupati', 'rajahmundry', 'kadapa', 'kannur',
  'calicut', 'kozhikode', 'bikaner', 'jodhpur', 'udaipur', 'jaisalmer', 'jabalpur', 'gwalior', 'surat', 'gaya',
  'darbhanga', 'vadodara', 'baroda', 'thiruvananthapuram', 'trivandrum', 'mysore', 'mysuru', 'dimapur', 'lilabari'
]);

const INDIAN_IATA_CODES = new Set([
  'DEL', 'BOM', 'BLR', 'HYD', 'MAA', 'CCU', 'PNQ', 'GOI', 'GOX', 'JAI', 'AMD', 'COK', 'GAU', 'PAT', 'RPR', 'IXC',
  'SLV', 'IXR', 'BHO', 'IMF', 'SHL', 'AJL', 'DMU', 'BBI', 'PYG', 'IXA', 'LKO', 'DED', 'IXZ', 'SXR', 'IXL', 'PNY',
  'ATQ', 'AGR', 'IXD', 'VNS', 'AYJ', 'IXJ', 'IXB', 'DIB', 'JRH', 'IXS', 'IDR', 'NAG', 'IXU', 'ISK', 'HSR', 'HBX',
  'IXG', 'IXE', 'TRZ', 'IXM', 'CJB', 'VGA', 'TIR', 'RJA', 'CDP', 'CNN', 'CCJ', 'BKB', 'JDH', 'UDR', 'JSA', 'JLR',
  'GWL', 'STV', 'GAY', 'DBR', 'TRV', 'BDQ'
]);

function isDomesticRoute(origin, destination) {
  const o = (origin || '').trim().toLowerCase();
  const d = (destination || '').trim().toLowerCase();
  const oCode = (cityCode(o) || '').toUpperCase();
  const dCode = (cityCode(d) || '').toUpperCase();
  
  const isOrigIndia = INDIAN_CITIES_SET.has(o) || INDIAN_IATA_CODES.has(oCode);
  const isDestIndia = INDIAN_CITIES_SET.has(d) || INDIAN_IATA_CODES.has(dCode);
  
  // Domestic only if both departure and arrival are inside India
  return isOrigIndia && isDestIndia;
}

function getRouteFlightConfig(origin, destination, seed) {
  const isDomestic = isDomesticRoute(origin, destination);
  if (isDomestic) {
    return {
      isInternational: false,
      airlines: [
        { name: 'IndiGo', code: '6E', mark: '6E', color: '#e0f2fe', ink: '#0284c7', website: 'MakeMyTrip' },
        { name: 'Air India', code: 'AI', mark: 'AI', color: '#fee2e2', ink: '#b91c1c', website: 'Goibibo' },
        { name: 'Air India Express', code: 'IX', mark: 'IX', color: '#ffedd5', ink: '#c2410c', website: 'EaseMyTrip' },
        { name: 'Akasa Air', code: 'QP', mark: 'QP', color: '#ffedd5', ink: '#ea580c', website: 'Yatra' },
        { name: 'SpiceJet', code: 'SG', mark: 'SG', color: '#fee2e2', ink: '#dc2626', website: 'Cleartrip' }
      ],
      baseDuration: 105 + (seed % 40),
      fareMultiplier: 3400 + (seed % 1100),
      stepFare: 420,
      baggage: '15kg Check-in Baggage Included'
    };
  }

  // International Routes
  const destLower = (destination || '').trim().toLowerCase();
  const dCode = (cityCode(destination) || '').toUpperCase();

  // 1. Dubai & Middle East (Dubai, Abu Dhabi, Doha, Sharjah, Riyadh, Muscat, Kuwait, Bahrain)
  if (['dubai', 'dxb', 'abu dhabi', 'auh', 'sharjah', 'shj', 'doha', 'doh', 'riyadh', 'ruh', 'jeddah', 'jed', 'muscat', 'mct', 'kuwait', 'kwi', 'bahrain', 'bah'].some(k => destLower.includes(k) || dCode === k.toUpperCase())) {
    return {
      isInternational: true,
      airlines: [
        { name: 'Emirates', code: 'EK', mark: 'EK', color: '#fee2e2', ink: '#d92525', website: 'Emirates Direct' },
        { name: 'flydubai', code: 'FZ', mark: 'FZ', color: '#dbeafe', ink: '#1d4ed8', website: 'flydubai Direct' },
        { name: 'Qatar Airways', code: 'QR', mark: 'QR', color: '#fce7f3', ink: '#58112e', website: 'Qatar Airways Direct' },
        { name: 'Etihad Airways', code: 'EY', mark: 'EY', color: '#fef3c7', ink: '#b45309', website: 'Etihad Direct' },
        { name: 'Air India', code: 'AI', mark: 'AI', color: '#fee2e2', ink: '#b91c1c', website: 'Air India International' }
      ],
      baseDuration: 225 + (seed % 35),
      fareMultiplier: 14500 + (seed % 2200),
      stepFare: 1150,
      baggage: '🧳 25kg Check-in Baggage Included'
    };
  }

  // 2. Europe & UK (London, Paris, Frankfurt, Amsterdam, Zurich, Rome, Madrid, Berlin)
  if (['london', 'lhr', 'lon', 'paris', 'cdg', 'par', 'frankfurt', 'fra', 'amsterdam', 'ams', 'zurich', 'zrh', 'rome', 'fco', 'madrid', 'mad', 'berlin', 'ber'].some(k => destLower.includes(k) || dCode === k.toUpperCase())) {
    return {
      isInternational: true,
      airlines: [
        { name: 'British Airways', code: 'BA', mark: 'BA', color: '#dbeafe', ink: '#1e3a8a', website: 'British Airways Direct' },
        { name: 'Virgin Atlantic', code: 'VS', mark: 'VS', color: '#fee2e2', ink: '#dc2626', website: 'Virgin Atlantic Direct' },
        { name: 'Lufthansa', code: 'LH', mark: 'LH', color: '#e0f2fe', ink: '#0369a1', website: 'Lufthansa Direct' },
        { name: 'Emirates', code: 'EK', mark: 'EK', color: '#fee2e2', ink: '#d92525', website: 'Emirates (via DXB)' },
        { name: 'Air India', code: 'AI', mark: 'AI', color: '#fee2e2', ink: '#b91c1c', website: 'Air India Dreamliner' }
      ],
      baseDuration: 535 + (seed % 55),
      fareMultiplier: 36000 + (seed % 4800),
      stepFare: 2600,
      baggage: '🧳 2x 23kg Baggage Included'
    };
  }

  // 3. Southeast Asia & Far East (Singapore, Bangkok, Bali, Kuala Lumpur, Phuket, Tokyo, Seoul)
  if (['singapore', 'sin', 'bangkok', 'bkk', 'bali', 'dps', 'kuala lumpur', 'kul', 'phuket', 'hkt', 'tokyo', 'nrt', 'tyo', 'seoul', 'icn', 'sel', 'hong kong', 'hkg', 'hanoi', 'han', 'saigon', 'sgn'].some(k => destLower.includes(k) || dCode === k.toUpperCase())) {
    return {
      isInternational: true,
      airlines: [
        { name: 'Singapore Airlines', code: 'SQ', mark: 'SQ', color: '#fef3c7', ink: '#d97706', website: 'Singapore Airlines Direct' },
        { name: 'Thai Airways', code: 'TG', mark: 'TG', color: '#ede9fe', ink: '#7c3aed', website: 'Thai Airways Direct' },
        { name: 'Malaysia Airlines', code: 'MH', mark: 'MH', color: '#fee2e2', ink: '#dc2626', website: 'Malaysia Airlines Direct' },
        { name: 'Cathay Pacific', code: 'CX', mark: 'CX', color: '#d1fae5', ink: '#047857', website: 'Cathay Pacific Direct' },
        { name: 'Air India', code: 'AI', mark: 'AI', color: '#fee2e2', ink: '#b91c1c', website: 'Air India International' }
      ],
      baseDuration: 285 + (seed % 45),
      fareMultiplier: 16500 + (seed % 2800),
      stepFare: 1350,
      baggage: '🧳 25kg Check-in Baggage Included'
    };
  }

  // 4. North America (New York, Newark, San Francisco, Chicago, Los Angeles, Toronto, Vancouver)
  if (['new york', 'jfk', 'newark', 'ewr', 'san francisco', 'sfo', 'chicago', 'ord', 'los angeles', 'lax', 'toronto', 'yyz', 'yto', 'vancouver', 'yvr', 'dallas', 'dfw', 'boston', 'bos'].some(k => destLower.includes(k) || dCode === k.toUpperCase())) {
    return {
      isInternational: true,
      airlines: [
        { name: 'United Airlines', code: 'UA', mark: 'UA', color: '#dbeafe', ink: '#1e40af', website: 'United Airlines Direct' },
        { name: 'Air India', code: 'AI', mark: 'AI', color: '#fee2e2', ink: '#b91c1c', website: 'Air India Nonstop USA' },
        { name: 'Qatar Airways', code: 'QR', mark: 'QR', color: '#fce7f3', ink: '#58112e', website: 'Qatar Airways (via DOH)' },
        { name: 'Emirates', code: 'EK', mark: 'EK', color: '#fee2e2', ink: '#d92525', website: 'Emirates (via DXB)' },
        { name: 'Delta Air Lines', code: 'DL', mark: 'DL', color: '#fee2e2', ink: '#991b1b', website: 'Delta Air Lines Direct' }
      ],
      baseDuration: 890 + (seed % 80),
      fareMultiplier: 54000 + (seed % 6500),
      stepFare: 3600,
      baggage: '🧳 2x 23kg Baggage Included'
    };
  }

  // 5. General Other International Routes
  return {
    isInternational: true,
    airlines: [
      { name: 'Emirates', code: 'EK', mark: 'EK', color: '#fee2e2', ink: '#d92525', website: 'Emirates Direct' },
      { name: 'Qatar Airways', code: 'QR', mark: 'QR', color: '#fce7f3', ink: '#58112e', website: 'Qatar Airways Direct' },
      { name: 'Etihad Airways', code: 'EY', mark: 'EY', color: '#fef3c7', ink: '#b45309', website: 'Etihad Direct' },
      { name: 'Singapore Airlines', code: 'SQ', mark: 'SQ', color: '#fef3c7', ink: '#d97706', website: 'Singapore Airlines Direct' },
      { name: 'Air India', code: 'AI', mark: 'AI', color: '#fee2e2', ink: '#b91c1c', website: 'Air India International' }
    ],
    baseDuration: 380 + (seed % 70),
    fareMultiplier: 24000 + (seed % 3800),
    stepFare: 1900,
    baggage: '🧳 25kg Check-in Baggage Included'
  };
}

async function searchPreviewFlights(){
  const origin=$('origin').value.trim(),destination=$('destination').value.trim(),button=$('flight-form').querySelector('button[type="submit"]');
  if(!origin||!destination)return;
  const travelers=Number($('travelers').value)||1;
  const seed=[...`${origin}|${destination}|${$('depart').value}|${$('cabin').value}`.toLowerCase()].reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7);
  const routeConfig = getRouteFlightConfig(origin, destination, seed);
  const isInternational = routeConfig.isInternational;
  const flightAirlines = routeConfig.airlines;
  const departureAt=new Date(`${$('depart').value}T06:30:00`),roundTrip=tripType==='round'&&Boolean($('return').value);
  flightSearchState='loading';flightSearchError='';currentOffers=[];button.disabled=true;button.textContent='Preparing...';updatePriceOutlook();
  $('flight-search-status').textContent=`Preparing ${isInternational ? 'international' : 'domestic'} SmartFly AI airline prices from ${origin} to ${destination}...`;
  updateFlightNotice();renderOffers();
  
  currentOffers=flightAirlines.map((airlineObj, index)=>{
    const name = airlineObj.name;
    const code = airlineObj.code;
    const mark = airlineObj.mark;
    const color = airlineObj.color;
    const ink = airlineObj.ink;
    const website = airlineObj.website;
    
    const outbound=new Date(departureAt.getTime()+(index*85+(seed%37))*60000);
    const duration = routeConfig.baseDuration + ((seed + index * 33) % 45);
    const arrival=new Date(outbound.getTime()+duration*60000);
    const baseFare=Math.round((routeConfig.fareMultiplier + index * routeConfig.stepFare)*travelers*(roundTrip?1.82:1));
    const taxes=Math.round(baseFare* (isInternational ? 0.14 : 0.18)),price=baseFare+taxes;
    
    let returnDepartureTime='',returnArrivalTime='';
    if(roundTrip){
      const returnDay=new Date(`${$('return').value}T12:00:00`);
      returnDay.setHours(9+index,15);
      returnDepartureTime=returnDay.toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
      returnArrivalTime=new Date(returnDay.getTime()+duration*60000).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
    }
    
    const stopDesc = isInternational ? (index === 0 || index === 1 ? 'Nonstop' : '1 stop') : (index === 2 || index === 4 ? '1 stop' : 'Nonstop');
    
    return {
      id:`preview-${seed}-${index}`,
      live:false,
      preview:true,
      isInternational,
      baggageInfo: routeConfig.baggage,
      source:'SmartFly AI preview',
      name,
      mark,
      color,
      ink,
      website,
      websiteUrl:`https://${website.toLowerCase().replace(/[^a-z0-9]/g,'')}.com`,
      airline:{name,code,flight: isInternational ? `International ${code} ${100 + index * 42}` : 'Scheduled service'},
      date:$('depart').value,
      departureTime:outbound.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
      arrivalTime:arrival.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}),
      departure:{airport:cityCode(origin)},
      arrival:{airport:cityCode(destination)},
      duration,
      stops: stopDesc,
      baseFare,
      taxes,
      baggage:null,
      price,
      currency:'INR',
      returnDepartureTime,
      returnArrivalTime,
      validatingAirlineCodes:[code]
    };
  }).sort((a,b)=>a.price-b.price);
  flightSearchState='preview';
  $('flight-search-status').textContent=`${currentOffers.length} illustrative airline prices ready. Lowest example fare is shown first; these are not live offers.`;
  $('results-title').textContent=`SmartFly AI flight prices from ${origin} to ${destination}`;
  $('results-subtitle').textContent=`${formatDate($('depart').value)}${roundTrip?` – ${formatDate($('return').value)}`:''} · ${travelers} traveler${travelers===1?'':'s'} · ${$('cabin').selectedOptions[0].text} · Illustrative prices`;
  if(!liveHotelResults.length){
    const state=$('hotel-state')?.value||'Maharashtra';
    liveHotelResults=createStateDemoHotels(state,destination,stayNights(),Number($('hotel-rooms').value)||1);
    hotelSearchState='demo';
    selectedHotel=liveHotelResults[0]?.id||'';
    $('hotel-api-status').textContent=`${liveHotelResults.length} fictional SmartFly AI preview properties for ${destination}, ${state}. These are not real hotels or offers.`;
  }
  const filter=$('airline-filter'),selected=filter.value;
  filter.innerHTML='<option value="all">All airlines</option>'+[...new Set(currentOffers.map(offer=>offer.airline.name))].map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  filter.value=[...filter.options].some(option=>option.value===selected)?selected:'all';
  updatePriceOutlook();button.disabled=false;button.innerHTML='<span>⌕</span> Compare prices <b>→</b>';updateFlightNotice();renderOffers();
}function renderOffers(){
  const stopsFilter=$('stops-filter').value,airlineFilter=$('airline-filter').value;
  let offers=currentOffers.filter(o=>(stopsFilter==='all'||o.stops===stopsFilter)&&(airlineFilter==='all'||o.airline.name===airlineFilter));
  $('result-count').textContent=flightSearchState==='preview'?`${offers.length} of ${currentOffers.length} SmartFly AI preview prices`:flightSearchState==='loading'?'Preparing preview prices...':`${offers.length} preview prices`;
  if(!offers.length){
    $('airline-price-comparison').hidden=true;$('airline-price-comparison').innerHTML='';
    const message=flightSearchState==='loading'?'Preparing illustrative airline prices...':flightSearchState==='stale'?'Search again to refresh the preview prices.':'Search to compare SmartFly AI illustrative airline prices.';
    $('result-list').innerHTML=`<div class="empty-results">${message}</div>`;
    $('match-summary').textContent='The lowest illustrative airline price will be highlighted after you search.';
    updateTripBudget([]);return;
  }
  if($('sort').value==='duration')offers.sort((a,b)=>a.duration-b.duration);else offers.sort((a,b)=>a.price-b.price);
  const stopCount=o=>o.stops==='Nonstop'?0:o.stops==='1 stop'?1:o.stops==='2+ stops'?2:0;
  const recommended=[...offers].sort((a,b)=>matchPriority==='time'?a.duration-b.duration:matchPriority==='stops'?(stopCount(a)-stopCount(b)||a.price-b.price):a.price-b.price)[0];
  const cheapestByWebsite=new Map();
  offers.forEach(offer=>{const prior=cheapestByWebsite.get(offer.website);if(!prior||offer.price<prior.price)cheapestByWebsite.set(offer.website,offer)});
  const websiteDeals=[...cheapestByWebsite.values()].sort((a,b)=>a.price-b.price);
  $('airline-price-comparison').hidden=websiteDeals.length<2;
  $('airline-price-comparison').innerHTML=websiteDeals.length>1?`<strong>Lowest sample price by website</strong><div>${websiteDeals.map(offer=>`<span><b>${escapeHtml(offer.website)}</b> ${money(offer.price)} · ${escapeHtml(offer.airline.name)}</span>`).join('')}</div>`:'';
  $('match-summary').textContent=matchPriority==='price'?`SmartFly AI pick: ${recommended.website} has the cheapest illustrative fare at ${money(recommended.price)}.`:matchPriority==='time'?`SmartFly AI pick: ${recommended.website} gives the shortest illustrative schedule.`:`SmartFly AI pick: ${recommended.website} has the fewest illustrative stops.`;
  $('result-list').innerHTML=offers.map(o=>{
    const details=`<button class="book-button flight-details-button" type="button" data-flight-details="${escapeHtml(o.id)}" data-requires-auth="true">Flight fare details</button><div class="flight-offer-details" hidden>${o.returnDepartureTime?`Return schedule: ${escapeHtml(o.returnDepartureTime)} → ${escapeHtml(o.returnArrivalTime)}. `:''}Website: ${escapeHtml(o.website)} · Airline: ${escapeHtml(o.airline.name)}. Illustrative schedule and price only; not a real flight offer or booking.</div>`;
    const provider=`${o.website} · ${o.airline.name}`;
    const caption='Illustrative price preview · not live';
    const times=`<div><b>${escapeHtml(o.departureTime)}</b><small>${escapeHtml(o.departure.airport)}</small></div><div class="flight-line" aria-hidden="true"></div><div><b>${escapeHtml(o.arrivalTime)}</b><small>${escapeHtml(o.arrival.airport)}</small></div>`;
    const pricing=`<small>${$('travelers').value} traveler${$('travelers').value==='1'?'':'s'} · INR</small><small>${money(o.baseFare)} base + ${money(o.taxes)} estimated taxes · baggage not included</small>`;
    const airlineDetail=`<div class="airline-detail"><span>${escapeHtml(o.website)}</span> ${escapeHtml(o.airline.name)}</div>`;
    const isBest=o===recommended,pick=isBest?`<span class="best-tag">SMARTFLY AI PICK · ${matchPriority==='price'?'CHEAPEST FARE':matchPriority==='time'?'FASTEST FLIGHT':'FEWEST STOPS'}</span>`:'';
    const routeBadge = o.isInternational ? `<span class="route-badge intl-badge">🌐 INTERNATIONAL FLIGHT</span>` : `<span class="route-badge domestic-badge">DOMESTIC</span>`;
    const baggageNote = o.baggageInfo || (o.isInternational ? '🧳 25kg checked baggage included' : '15kg check-in baggage included');

    return `<article class="fare-card ${isBest?'best':''} ${o===offers[0]&&matchPriority==='price'?'lowest-fare':''}">
      <div class="provider-wrap">
        <div class="provider-logo" style="background:${escapeHtml(o.color)};color:${escapeHtml(o.ink)}">${escapeHtml(o.mark)}</div>
        <div>
          <div class="provider-name">${escapeHtml(provider)}</div>
          <div class="provider-caption">${routeBadge} · ${escapeHtml(caption)}</div>
          ${airlineDetail}
          ${pick}
        </div>
      </div>
      <div class="flight-times">${times}</div>
      <div class="duration">${Math.floor(o.duration/60)}h ${o.duration%60}m<small>${escapeHtml(o.stops)}</small></div>
      <div class="fare-price">${money(o.price)}<small>${$('travelers').value} traveler${$('travelers').value==='1'?'':'s'} · INR</small><small>${money(o.baseFare)} base + ${money(o.taxes)} estimated taxes · ${baggageNote}</small></div>
      ${details}
    </article>`;
  }).join('');
  $('result-list').querySelectorAll('[data-flight-details]').forEach(button=>button.addEventListener('click',()=>{
    if(!requireAuth('view flight details')) return;
    const panel=button.nextElementSibling;
    panel.hidden=!panel.hidden;
    button.textContent=panel.hidden?'Flight fare details':'Hide fare details';
  }));
  updateTripBudget(offers);
}function updateTripBudget(offers){
  const flight=flightSearchState==='preview'&&offers.length?Math.min(...offers.map(o=>o.price)):null;
  if(!liveHotelResults.length && currentOffers.length && flight!==null){
    const state=$('hotel-state')?.value||'Maharashtra';
    const destination=$('destination').value.trim()||$('hotel-destination').value.trim()||'Mumbai';
    liveHotelResults=createStateDemoHotels(state,destination,stayNights(),Number($('hotel-rooms').value)||1);
    hotelSearchState='demo';
    selectedHotel=liveHotelResults[0]?.id||'';
  }
  const stay=['live','demo'].includes(hotelSearchState)?liveHotelResults.find(item=>item.id===selectedHotel) || liveHotelResults[0]:null;
  if(flight===null||!stay){$('trip-budget-copy').textContent='Search SmartFly AI preview prices and a hotel to see an illustrative combined estimate.';$('trip-total').textContent='';return}
  const hotel=stay.totalPerRoom*stay.roomQuantity;
  const taxes=Math.round(flight*0.12 + hotel*0.08);
  const travellers=Number($('travelers').value)||1;
  const total=flight + hotel + taxes;
  const perPerson=Math.round(total / travellers);
  const savings=Math.round((flight + hotel + taxes) * 0.08);
  const savingsPct=8;
  $('trip-budget-copy').textContent='This total combines illustrative SmartFly AI flight pricing with the selected hotel price.';
  $('trip-total').innerHTML=`
    <div class="trip-estimate-wrap">
      <div class="trip-value-badge">Best value</div>
      <div class="trip-progress"><span></span></div>
    </div>
    <strong>${hotelMoney(total)}</strong>
    <small>ILLUSTRATIVE TOTAL · flight ${money(flight)} + stay ${hotelMoney(hotel,stay.currency)} + taxes ${money(taxes)}</small>
    <div class="trip-estimate-breakdown">
      <span>Per traveler: ${money(perPerson)}</span>
      <span>Estimated savings: ${money(savings)} (${savingsPct}%)</span>
    </div>
    <div class="trip-book-options">
      <button type="button" class="trip-book-button trip-book-flight" data-book-mode="flight" data-requires-auth="true">Book flight only</button>
      <button type="button" class="trip-book-button trip-book-combo" data-book-mode="combo" data-requires-auth="true">Book flight + stay</button>
    </div>
  `;
}
function updatePriceOutlook(){
  const copy=$('price-outlook-copy'),chart=$('history-chart');
  if(flightSearchState!=='preview'||!currentOffers.length){copy.textContent='Illustrative sample prices for three departure windows. These are generated examples, not live fares or a real forecast.';chart.innerHTML='';return}
  const lowest=currentOffers[0].price,seed=[...`${$('origin').value}${$('destination').value}${$('depart').value}`.toLowerCase()].reduce((sum,char)=>(sum*33+char.charCodeAt(0))>>>0,11);
  const factors=[0.94+(seed%8)/100,0.98+((seed>>>3)%8)/100,1.02+((seed>>>6)%9)/100],periods=['1–30 days','31–60 days','61–90 days'];
  const points=periods.map((period,index)=>({period,price:Math.round(lowest*factors[index]/100)*100}));
  copy.textContent='SmartFly AI illustrative fare examples for trips departing in the next three months. They are not live fares, market data, or a reliable price prediction.';
  const max=Math.max(...points.map(point=>point.price));
  chart.innerHTML=points.map(point=>{const height=Math.max(25,point.price/max*58);return `<div title="Illustrative estimate for ${point.period}: ${money(point.price)}"><i style="height:${height}px"></i><small>${point.period}</small><small>${money(point.price)}</small></div>`}).join('');
}const indiaHotelCityAliases={delhi:'Delhi',mumbai:'Mumbai',bombay:'Mumbai','navi mumbai':'Navi Mumbai',visakhapatnam:'Visakhapatnam',vizag:'Visakhapatnam',itanagar:'Itanagar',guwahati:'Guwahati',patna:'Patna',raipur:'Raipur',goa:'Goa',panaji:'Goa',ahmedabad:'Ahmedabad',chandigarh:'Chandigarh',shimla:'Shimla',ranchi:'Ranchi',bengaluru:'Bengaluru',bangalore:'Bengaluru',kochi:'Kochi',cochin:'Kochi',bhopal:'Bhopal',imphal:'Imphal',shillong:'Shillong',aizawl:'Aizawl',kohima:'Kohima',bhubaneswar:'Bhubaneswar',jaipur:'Jaipur',gangtok:'Gangtok',chennai:'Chennai',hyderabad:'Hyderabad',agartala:'Agartala',lucknow:'Lucknow',dehradun:'Dehradun',kolkata:'Kolkata','port blair':'Port Blair',daman:'Daman',srinagar:'Srinagar',leh:'Leh',kavaratti:'Kavaratti',puducherry:'Puducherry'};
let hotelPriority='value',selectedHotel='',hotelSearchState=null,liveHotelResults=[],hotelSearchError='',hotelProviderEnvironment='production';
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const hotelMoney=(amount,currency='INR')=>{try{return new Intl.NumberFormat('en-IN',{style:'currency',currency,maximumFractionDigits:0}).format(Number(amount)||0)}catch{return money(amount)}};
function buildBookingSummary(type,item){
  const flight=currentOffers[0];
  const stay=liveHotelResults.find(entry=>entry.id===selectedHotel) || liveHotelResults[0];
  if(type==='combo'){
    return `Flight: ${flight.departure.airport} to ${flight.arrival.airport} · ${flight.airline.name} · ${money(getFlightFareForPassengerCount(flight))} · Stay: ${stay.name} · ${hotelMoney(stay.totalPerRoom*stay.roomQuantity,stay.currency)} (fictional SmartFly AI preview)`;
  }
  if(type==='flight'){
    return `${item.departure.airport} to ${item.arrival.airport} · ${item.airline.name} · ${money(getFlightFareForPassengerCount(item))} (fictional SmartFly AI preview)`;
  }
  return `${item.name} · ${hotelMoney(item.totalPerRoom*item.roomQuantity,item.currency)} (fictional SmartFly AI preview)`;
}

function getPassengerCount(){
  return Math.max(1,Number($('passenger-travelers')?.value || $('travelers').value) || 1);
}

function getFlightFareForPassengerCount(item){
  const searchedTravelers=Math.max(1,Number($('travelers').value)||1);
  return Number(item?.price||0)/searchedTravelers*getPassengerCount();
}

function getBookingTotal(type,item){
  const flightFare=getFlightFareForPassengerCount(item);
  if(type==='flight') return flightFare;
  if(type==='hotel') return Number(item?.totalPerRoom * (item?.roomQuantity || 1) || 0);
  const flight=currentOffers[0];
  const stay=liveHotelResults.find(entry=>entry.id===selectedHotel) || liveHotelResults[0];
  return (getFlightFareForPassengerCount(flight) + Number((stay?.totalPerRoom || 0) * (stay?.roomQuantity || 1) || 0));
}

function hasWelcomeOfferBeenUsed(){
  try{
    return localStorage.getItem(WELCOME_OFFER_KEY)==='used';
  }catch(error){
    return false;
  }
}

function renderPassengerTotal(type,item){
  const baseTotal=getBookingTotal(type,item);
  const passengerCount=getPassengerCount();
  const offerUsed=hasWelcomeOfferBeenUsed();
  const finalTotal=offerUsed?baseTotal*0.9:baseTotal;
  
  $('passenger-total-box').innerHTML = `
    <div class="checkout-price-left">
      <span class="total-label">TOTAL FOR ${passengerCount} TRAVELER${passengerCount===1?'':'S'}</span>
      <small class="tax-note">All airline taxes, airport surcharges &amp; GST included</small>
    </div>
    <div class="checkout-price-right">
      ${offerUsed ? `<span class="checkout-strike-price">${money(baseTotal)}</span>` : ''}
      <strong class="checkout-final-price">${money(finalTotal)}</strong>
      ${offerUsed ? '<span class="checkout-discount-tag">✓ 10% Welcome Discount Applied</span>' : ''}
    </div>
  `;
  $('welcome-offer-box').hidden=offerUsed;
  $('welcome-offer-applied').hidden=!offerUsed;
  $('welcome-offer-message').innerHTML=`<div><strong>🎉 Welcome offer applied: ${money(baseTotal*0.1)} saved!</strong><small>Flat 10% discount on your first booking</small></div>`;
}

function openPassengerDetails(type,item){
  if(!requireAuth('passenger details')) return;
  if(!item)return;
  selectedBookingMode=type;
  selectedBookingItem=item;
  
  const title=type==='combo'?'Passenger details for your trip':type==='flight'?'Passenger details for your flight':'Passenger details for your stay';
  $('passenger-form-title').textContent=title;

  const flightObj = type === 'combo' ? currentOffers[0] : (type === 'flight' ? item : null);
  const hotelObj = type === 'combo' ? (liveHotelResults.find(entry=>entry.id===selectedHotel) || liveHotelResults[0]) : (type === 'hotel' ? item : null);
  
  let summaryHtml = '';
  if (type === 'combo') {
    summaryHtml = `
      <div class="checkout-trip-card">
        <div class="checkout-badge-row">
          <span class="trip-combo-badge">✨ SmartFly AI Flight + Stay Combo</span>
          <span class="trip-guarantee-badge">✓ Price Lock Guarantee</span>
        </div>
        <div class="checkout-route-row">
          <div class="route-flight-part">
            <span class="icon">✈️</span>
            <div>
              <strong>${flightObj?.departure?.airport || 'DEL'} ➔ ${flightObj?.arrival?.airport || 'DXB'}</strong>
              <small>${flightObj?.airline?.name || 'Selected Airline'} · ${$('depart').value ? formatDate($('depart').value) : 'Departure'}</small>
            </div>
          </div>
          <div class="route-divider">+</div>
          <div class="route-hotel-part">
            <span class="icon">🏨</span>
            <div>
              <strong>${hotelObj?.name || 'Curated Luxury Stay'}</strong>
              <small>${hotelObj?.area || 'Prime Location'} · ${stayNights()} Nights Stay</small>
            </div>
          </div>
        </div>
      </div>
    `;
  } else if (type === 'flight') {
    summaryHtml = `
      <div class="checkout-trip-card">
        <div class="checkout-badge-row">
          <span class="trip-combo-badge">✈️ Flight Reservation</span>
          <span class="trip-guarantee-badge">✓ Instant Confirmation</span>
        </div>
        <div class="checkout-route-row">
          <div class="route-flight-part">
            <span class="icon">🛫</span>
            <div>
              <strong>${item.departure?.airport || 'DEL'} ➔ ${item.arrival?.airport || 'BOM'}</strong>
              <small>${item.airline?.name || 'Selected Airline'} · ${$('depart').value ? formatDate($('depart').value) : 'Departure'}</small>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    summaryHtml = `
      <div class="checkout-trip-card">
        <div class="checkout-badge-row">
          <span class="trip-combo-badge">🏨 Luxury Stay Reservation</span>
          <span class="trip-guarantee-badge">✓ Free Cancellation</span>
        </div>
        <div class="checkout-route-row">
          <div class="route-hotel-part">
            <span class="icon">🛎️</span>
            <div>
              <strong>${item.name || 'Selected Hotel'}</strong>
              <small>${item.area || 'Prime Location'} · ${stayNights()} Nights · 1 Room</small>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  
  $('passenger-trip-summary').innerHTML = summaryHtml;
  $('passenger-form').reset();
  
  const user = getStoredUser();
  if (user && user.phone) {
    const rawDigits = user.phone.replace(/\D/g, '').slice(-10);
    if ($('passenger-phone')) $('passenger-phone').value = rawDigits;
  }
  
  $('passenger-travelers').value=String(Math.min(Number($('travelers').value)||1,6));
  renderTravelerFields(getPassengerCount());
  renderPassengerTotal(type,item);
  $('passenger-details-modal').showModal();
}

function openDemoBooking(type,item){
  if(!requireAuth('booking')) return;
  if(!item)return;
  selectedDemoBooking={type,item};
  const baseTotal=getBookingTotal(type,item);
  const discountedTotal=hasWelcomeOfferBeenUsed()?baseTotal*0.9:baseTotal;
  $('demo-booking-title').textContent=type==='combo'?'Review SmartFly AI trip':type==='flight'?'Review SmartFly AI flight':'Review SmartFly AI stay';
  $('demo-booking-summary').textContent=`${buildBookingSummary(type,item)} · Total: ${money(discountedTotal)}${hasWelcomeOfferBeenUsed()?' (10% welcome offer applied)':''}`;
  $('demo-book-confirm').hidden=false;
  $('demo-booking-result').textContent='No reservation or payment will be made.';
  $('demo-booking-modal').showModal();
}

function renderTravelerFields(count){
  const container=$('passenger-traveler-list');
  const previous=Array.from(container.querySelectorAll('.traveler-detail-card')).map(card=>({
    title:card.querySelector('[data-traveler-field="title"]').value,
    first:card.querySelector('[data-traveler-field="first"]').value,
    last:card.querySelector('[data-traveler-field="last"]').value
  }));
  container.innerHTML=Array.from({length:count},(_,index)=>`
    <fieldset class="traveler-detail-card">
      <legend>Traveler ${index+1}</legend>
      <div class="traveler-fields">
        <label><span>Title</span><select data-traveler-field="title"><option>Mr</option><option>Ms</option><option>Mrs</option><option>Dr</option></select></label>
        <label><span>First name</span><input data-traveler-field="first" type="text" placeholder="First name" required></label>
        <label><span>Last name</span><input data-traveler-field="last" type="text" placeholder="Last name" required></label>
      </div>
    </fieldset>
  `).join('');
  Array.from(container.querySelectorAll('.traveler-detail-card')).forEach((card,index)=>{
    const values=previous[index];
    if(!values)return;
    card.querySelector('[data-traveler-field="title"]').value=values.title;
    card.querySelector('[data-traveler-field="first"]').value=values.first;
    card.querySelector('[data-traveler-field="last"]').value=values.last;
  });
}

function getTicketPassengerName(){
  return Array.from($('passenger-traveler-list').querySelectorAll('.traveler-detail-card')).map(card=>{
    const title=card.querySelector('[data-traveler-field="title"]').value;
    const first=card.querySelector('[data-traveler-field="first"]').value.trim();
    const last=card.querySelector('[data-traveler-field="last"]').value.trim();
    return [title,first,last].filter(Boolean).join(' ');
  }).join(', ');
}

function getBookingReference(){
  return `SF-${Date.now().toString(36).toUpperCase().slice(-8)}`;
}

function getSelectedTotalForBooking(){
  if(!selectedDemoBooking) return 0;
  const baseTotal=getBookingTotal(selectedDemoBooking.type, selectedDemoBooking.item);
  return hasWelcomeOfferBeenUsed()?baseTotal*0.9:baseTotal;
}

function getTicketDetails(){
  const booking=selectedDemoBooking;
  const flight=booking?.type==='flight'?booking.item:booking?.type==='combo'?currentOffers[0]:null;
  const stay=booking?.type==='hotel'?booking.item:booking?.type==='combo'?liveHotelResults.find(item=>item.id===selectedHotel)||liveHotelResults[0]:null;
  const flightSummary=flight?`${flight.airline?.name||'Selected flight'} · ${flight.departure?.airport||''} → ${flight.arrival?.airport||''}`:'';
  const hotelSummary=stay?.name||'';
  const departureDate=$('depart').value?formatDate($('depart').value):'Not selected';
  const flightDates=tripType==='round'&&$('return').value?`${departureDate} – ${formatDate($('return').value)}`:departureDate;
  const checkinDate=$('hotel-checkin').value?formatDate($('hotel-checkin').value):'Not selected';
  const checkoutDate=$('hotel-checkout').value?formatDate($('hotel-checkout').value):'Not selected';
  const dates=booking?.type==='combo'?`Flight: ${flightDates} · Stay: ${checkinDate} – ${checkoutDate}`:booking?.type==='hotel'?`Stay: ${checkinDate} – ${checkoutDate}`:`Flight: ${flightDates}`;
  return {flight:flightSummary,hotel:hotelSummary,dates};
}

function renderPaymentForm(method){
  selectedPaymentMethod=method;
  $('payment-status').textContent='';
  $('payment-status').className='payment-status';
  document.querySelectorAll('.payment-option').forEach(button=>button.classList.toggle('selected', button.dataset.paymentMethod===method));

  if(method==='upi'){
    $('payment-method-form').innerHTML=`
      <label class="payment-field">
        <span>Select UPI ID</span>
        <select id="payment-upi-select">
          <option value="">Choose a UPI ID</option>
          <option value="smartfly@upi">smartfly@upi</option>
          <option value="booksmartfly@okaxis">booksmartfly@okaxis</option>
          <option value="smartflypay@ibl">smartflypay@ibl</option>
        </select>
      </label>
      <div id="upi-status" class="payment-hint">UPI ID validity will be checked before payment is confirmed.</div>
    `;
    const select=$('payment-upi-select');
    if(select){select.addEventListener('change',()=>{
      const value=select.value.trim();
      const valid=/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/i.test(value);
      $('upi-status').textContent=valid?`UPI ID ${value} looks valid and ready for verification.`:`Please choose a valid UPI ID.`;
      $('upi-status').classList.toggle('payment-hint-valid', valid);
      $('upi-status').classList.toggle('payment-hint-invalid', !valid);
    });}
    return;
  }

  const idMap={gpay:'Enter GPay number', phonepe:'Enter PhonePe number', paytm:'Enter Paytm number'};
  const hintMap={gpay:'Use your linked GPay UPI/mobile number', phonepe:'Use your linked PhonePe UPI/mobile number', paytm:'Use your linked Paytm UPI/mobile number'};
  $('payment-method-form').innerHTML=`
    <label class="payment-field">
      <span>${idMap[method] || 'Mobile / UPI'}</span>
      <input id="payment-mobile" type="text" value="" placeholder="e.g. 98765 43210 or name@upi" required>
    </label>
    <div class="payment-hint">${hintMap[method] || 'Use the linked number for this payment option.'}</div>
  `;

  if(method==='bank'){
    $('payment-method-form').innerHTML=`
      <div class="bank-grid">
        <label class="payment-field">
          <span>Account holder name</span>
          <input id="payment-holder-name" type="text" placeholder="Holder name" required>
        </label>
        <label class="payment-field">
          <span>Account number</span>
          <input id="payment-account-number" type="text" inputmode="numeric" placeholder="Enter account number" required>
        </label>
        <label class="payment-field">
          <span>IFSC code</span>
          <input id="payment-ifsc" type="text" placeholder="e.g. SBIN0001234" required>
        </label>
      </div>
      <div class="payment-hint">Bank transfer is verified using the holder name, account number, and IFSC code.</div>
    `;
  }
}

function validatePaymentDetails(){
  const method=selectedPaymentMethod;
  if(method==='upi'){
    const value=$('payment-upi-select')?.value?.trim() || '';
    const valid=/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/i.test(value);
    if(!valid){
      $('payment-status').textContent='Please choose a valid UPI ID before verifying.';
      $('payment-status').className='payment-status payment-error';
      return false;
    }
    $('payment-status').textContent='UPI ID verified successfully.';
    $('payment-status').className='payment-status payment-success';
    return true;
  }

  if(method==='bank'){
    const holder=($('payment-holder-name')?.value || '').trim();
    const account=($('payment-account-number')?.value || '').trim();
    const ifsc=($('payment-ifsc')?.value || '').trim();
    const valid=holder && account.length >= 8 && /^[A-Z]{4}0[A-Z0-9]{6}$/i.test(ifsc);
    if(!valid){
      $('payment-status').textContent='Please enter valid bank details including holder name, account number, and IFSC code.';
      $('payment-status').className='payment-status payment-error';
      return false;
    }
    $('payment-status').textContent='Bank details verified successfully.';
    $('payment-status').className='payment-status payment-success';
    return true;
  }

  const value=($('payment-mobile')?.value || '').trim();
  if(!value){
    $('payment-status').textContent='Please enter your linked payment details before verifying.';
    $('payment-status').className='payment-status payment-error';
    return false;
  }
  const valid=value.length>=8;
  if(!valid){
    $('payment-status').textContent='Payment details look incomplete. Please check the number or UPI ID.';
    $('payment-status').className='payment-status payment-error';
    return false;
  }
  $('payment-status').textContent='Payment details verified successfully.';
  $('payment-status').className='payment-status payment-success';
  return true;
}

function openPaymentModal(){
  renderPaymentForm(selectedPaymentMethod || 'gpay');
  $('payment-modal').showModal();
}

function openTicketModal(){
  const ref=getBookingReference();
  const passengerName=getTicketPassengerName();
  const details=getTicketDetails();
  const total=getSelectedTotalForBooking();
  $('ticket-reference').textContent=ref;
  $('ticket-passenger').textContent=passengerName || 'Passenger';
  $('ticket-flight').textContent=details.flight;
  $('ticket-flight-row').hidden=!details.flight;
  $('ticket-hotel').textContent=details.hotel;
  $('ticket-hotel-row').hidden=!details.hotel;
  $('ticket-dates').textContent=details.dates;
  $('ticket-payment').textContent=selectedPaymentMethod.toUpperCase();
  $('ticket-total').textContent=money(total);
  $('ticket-modal').showModal();
}

function downloadTicket(){
  const ref=$('ticket-reference').textContent;
  const passengerName=getTicketPassengerName();
  const details=getTicketDetails();
  const rows=[
    `<div class="row"><span>Booking reference</span><strong>${escapeHtml(ref)}</strong></div>`,
    `<div class="row"><span>Passenger</span><strong>${escapeHtml(passengerName || 'Passenger')}</strong></div>`,
    details.flight?`<div class="row"><span>Flight</span><strong>${escapeHtml(details.flight)}</strong></div>`:'',
    details.hotel?`<div class="row"><span>Hotel</span><strong>${escapeHtml(details.hotel)}</strong></div>`:'',
    `<div class="row"><span>Travel dates</span><strong>${escapeHtml(details.dates)}</strong></div>`,
    `<div class="row"><span>Payment method</span><strong>${escapeHtml(selectedPaymentMethod.toUpperCase())}</strong></div>`,
    `<div class="row total"><span>Total paid</span><strong>${escapeHtml(money(getSelectedTotalForBooking()))}</strong></div>`
  ].join('');
  const content=`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>SmartFly AI Ticket ${escapeHtml(ref)}</title>
  <style>
    *{box-sizing:border-box}body{margin:0;padding:36px 16px;background:#f4f8f5;color:#17333c;font-family:Arial,sans-serif}.ticket{max-width:620px;margin:0 auto;padding:32px;border:1px solid #dce9e3;border-radius:16px;background:#fff;box-shadow:0 20px 70px #17333c22}.brand{display:flex;justify-content:center;align-items:center;gap:10px;margin-bottom:24px}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:11px;background:linear-gradient(145deg,#11a4a0,#087078);color:#fff;font-size:22px}.brand-name{font-size:20px;font-weight:800}.brand-name span{color:#0b8883}.eyebrow{margin:0;color:#0c8981;font-size:11px;font-weight:700;letter-spacing:1px;text-align:center}.title{margin:9px 0 22px;font-size:25px;text-align:center}.details{display:grid;gap:0;padding:20px;border:1px solid #dfeae7;border-radius:12px;background:#f9fdfb}.row{display:flex;justify-content:space-between;gap:18px;padding:13px 0;border-bottom:1px dashed #dfe8e5;font-size:14px}.row:first-child{padding-top:0}.row:last-child{padding-bottom:0;border:0}.row span{color:#697d7b}.row strong{text-align:right;color:#143f3d}.row.total strong{color:#0c8981;font-size:19px}.note{margin:18px 0 0;color:#72857f;font-size:12px;text-align:center}@media print{body{padding:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.ticket{max-width:none;border:0;box-shadow:none}}
  </style>
</head>
<body>
  <main class="ticket">
    <div class="brand"><span class="mark">✳</span><strong class="brand-name">SmartFly <span>AI</span></strong></div>
    <p class="eyebrow">BOOKING CONFIRMED</p>
    <h1 class="title">Your ticket has been booked</h1>
    <section class="details">${rows}</section>
    <p class="note">This is a SmartFly AI demo ticket. Not a real reservation.</p>
  </main>
</body>
</html>`;

  const blob=new Blob([content],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;
  link.download=`smartfly-ticket-${ref}.html`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast('Ticket downloaded successfully.', 'success');
}

function mapLiveHotel(result,nights){
  const amount=Number(result.price?.total)||0,roomCount=Number(result.roomQuantity)||1;
  const coords=result.latitude&&result.longitude&&result.cityLatitude&&result.cityLongitude;
  let locationScore=999;
  if(coords){const rad=n=>n*Math.PI/180,dLat=rad(result.latitude-result.cityLatitude),dLon=rad(result.longitude-result.cityLongitude),a=Math.sin(dLat/2)**2+Math.cos(rad(result.cityLatitude))*Math.cos(rad(result.latitude))*Math.sin(dLon/2)**2;locationScore=6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
  const address=[...(result.address?.lines||[]),result.address?.cityName,result.address?.postalCode].filter(Boolean).join(', ');
  const cancellation=result.policies?.cancellation||{},free=['FULL_REFUNDABLE','FREE_CANCELLATION'].includes(cancellation.type);
  const excludedTaxes=(result.price?.taxes||[]).filter(tax=>tax.included===false),taxNote=excludedTaxes.length?'Some taxes may be payable separately':result.price?.taxes?.length?'Tax details supplied by provider':'Tax inclusion not specified';
  return {id:`${result.hotelId}-${result.offerId}`,hotelId:result.hotelId,offerId:result.offerId,name:result.name,kind:result.category?`${result.category}-star hotel`:'Hotel',area:address||`${result.city}${result.countryCode?`, ${result.countryCode}`:''}`,rating:result.category||'',reviews:null,night:amount/Math.max(1,nights),free,breakfast:/BREAKFAST/i.test(result.boardType||'')||/BREAKFAST/i.test(result.room?.description?.text||''),locationScore,currency:result.price?.currency||'INR',live:true,demo:false,totalPerRoom:amount,roomQuantity:roomCount,roomDescription:result.room?.description?.text||result.room?.typeEstimated?.category||'Room details supplied by Amadeus',cancellationText:cancellation.description?.text||cancellation.type||'Cancellation details not supplied',taxNote,mapUrl:coords?`https://www.google.com/maps/search/?api=1&query=${result.latitude},${result.longitude}`:'',provider:'Amadeus',tag:'Current offer',thumbnail:hotelPhotoUrl(`${result.hotelId}-${result.name}`)};
}
const indiaStateCapitals={"Andhra Pradesh":"Visakhapatnam","Arunachal Pradesh":"Itanagar","Assam":"Guwahati","Bihar":"Patna","Chhattisgarh":"Raipur","Goa":"Panaji","Gujarat":"Ahmedabad","Haryana":"Gurugram","Himachal Pradesh":"Shimla","Jharkhand":"Ranchi","Karnataka":"Bengaluru","Kerala":"Kochi","Madhya Pradesh":"Bhopal","Maharashtra":"Mumbai","Manipur":"Imphal","Meghalaya":"Shillong","Mizoram":"Aizawl","Nagaland":"Kohima","Odisha":"Bhubaneswar","Punjab":"Amritsar","Rajasthan":"Jaipur","Sikkim":"Gangtok","Tamil Nadu":"Chennai","Telangana":"Hyderabad","Tripura":"Agartala","Uttar Pradesh":"Lucknow","Uttarakhand":"Dehradun","West Bengal":"Kolkata"};
const demoHotelStyles=['Cedar Court','Monsoon House','Lotus Quay','Amber Courtyard','The Fern Atrium','Riverstone Lodge','Blue Orchid Suites','Crown & Canopy','Mango Grove Retreat','The Copper Roof','Saffron Pavilion','Cloudline Residency'];
const demoHotelPhotos=['photo-1566073771259-6a8506099945','photo-1564501049412-61c2a3083791','photo-1571896349842-33c89424de2d','photo-1582719508461-905c673771fd','photo-1542314831-068cd1dbfeeb','photo-1568084680786-a84f91d1153c','photo-1578683010236-d716f9a3f461','photo-1590490360182-c33d57733427','photo-1611892440504-42a792e24d32','photo-1566665797739-1674de7a421a','photo-1596436889106-be35e843f974','photo-1571003123894-1f0594d2b5d9'];
function hotelPhotoUrl(key){const hash=[...String(key)].reduce((sum,char)=>(sum*31+char.charCodeAt(0))>>>0,7),index=hash%demoHotelPhotos.length;return `https://images.unsplash.com/${demoHotelPhotos[index]}?auto=format&fit=crop&w=480&q=75`}
function getInternationalLocationTag(city) {
  const c = (city || '').toLowerCase();
  if (c.includes('dubai') || c.includes('abu dhabi') || c.includes('sharjah')) return 'UAE';
  if (c.includes('doha')) return 'Qatar';
  if (c.includes('riyadh') || c.includes('jeddah')) return 'Saudi Arabia';
  if (c.includes('london')) return 'UK';
  if (c.includes('paris')) return 'France';
  if (c.includes('frankfurt') || c.includes('berlin') || c.includes('munich')) return 'Germany';
  if (c.includes('singapore')) return 'Singapore';
  if (c.includes('bangkok') || c.includes('phuket')) return 'Thailand';
  if (c.includes('bali')) return 'Indonesia';
  if (c.includes('kuala lumpur')) return 'Malaysia';
  if (c.includes('tokyo')) return 'Japan';
  if (c.includes('new york') || c.includes('san francisco') || c.includes('chicago')) return 'USA';
  if (c.includes('toronto') || c.includes('vancouver')) return 'Canada';
  return 'International';
}

function createStateDemoHotels(state,destination,nights,rooms){
  const city=destination||indiaStateCapitals[state]||'Mumbai',seed=[...`${state}${city}`.toLowerCase()].reduce((n,c)=>n+c.charCodeAt(0),0);
  const isDomestic = typeof INDIAN_CITIES_SET !== 'undefined' && INDIAN_CITIES_SET.has(city.toLowerCase());
  const locationCountry = isDomestic ? state : getInternationalLocationTag(city);
  
  return demoHotelStyles.map((style,i)=>{
    const night=3300+(seed%1700)+i*475,free=i%3!==2,breakfast=i%2===1,photoIndex=(seed+i*5)%demoHotelPhotos.length;
    const hotelDisplayName = isDomestic ? `${style} ${city}, ${state}` : `${style} ${city}, ${locationCountry}`;
    const hotelAreaName = `${['City Centre','Marina District','Heritage Quarter','Grand Boulevard'][i%4]}, ${city}`;
    return {
      id:`demo-hotel-${(isDomestic ? state : locationCountry).toLowerCase().replace(/\s/g,'-')}-${i}`,
      name: hotelDisplayName,
      kind:`${3+i%3}-star SmartFly AI hotel preview`,
      area: hotelAreaName,night,rating:String(3+i%3),free,breakfast,locationScore:i+1,tag:i===0?'Best value':i===1?'Comfort pick':'SmartFly AI preview',roomDescription:`${['Classic double','Garden view','Deluxe king','City view'][i%4]} room`,cancellationText:free?'Free cancellation for this SmartFly AI listing':'Illustrative non-refundable rate',taxNote:'Illustrative SmartFly AI total; not a quote',provider:'SmartFly AI preview listings',totalPerRoom:night*nights,roomQuantity:rooms,currency:'INR',live:false,demo:true,mapUrl:'',thumbnail:`https://images.unsplash.com/${demoHotelPhotos[photoIndex]}?auto=format&fit=crop&w=480&q=75`}});
}
async function requestLiveHotelOffers(){
  const button=$("hotel-search-form").querySelector("button[type=\"submit\"]");
  button.disabled=true;$('hotel-demo-preview').disabled=true;button.textContent="Searching...";hotelSearchState="loading";hotelSearchError="";
  $("hotel-api-status").textContent="Searching Amadeus hotel inventory and current offers...";liveHotelResults=[];renderHotels();updateTripBudget(currentOffers);
  try{
    const response=await fetch('/api/hotels/search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({destination:$('hotel-destination').value.trim(),countryCode:'IN',checkInDate:$('hotel-checkin').value,checkOutDate:$('hotel-checkout').value,adults:Number($('hotel-adults').value),rooms:Number($('hotel-rooms').value)}),signal:AbortSignal.timeout(45000)});
    const payload=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(payload.error||`Hotel search failed (HTTP ${response.status}).`);
    hotelProviderEnvironment=payload.environment||'production';
    liveHotelResults=(payload.results||[]).map(item=>mapLiveHotel(item,stayNights()));
    hotelSearchState='live';selectedHotel=liveHotelResults[0]?.id||'';
    $('hotel-api-status').textContent=liveHotelResults.length?`${liveHotelResults.length} Amadeus offers for ${payload.city||$('hotel-destination').value} · ${stayNights()} nights · ${hotelProviderEnvironment==='test'?'TEST DATA - not live availability':'live provider results'}.`:`Amadeus returned no available hotel offers for these dates. Try another destination or dates.`;
  }catch(error){hotelSearchState='error';hotelSearchError=error.name==='TimeoutError'?'The hotel provider took too long to respond. Please try again.':error.message;$('hotel-api-status').textContent=`Hotel search unavailable: ${hotelSearchError}`}
  finally{button.disabled=false;$('hotel-demo-preview').disabled=false;button.textContent='Search Amadeus offers';renderHotels();updateTripBudget(currentOffers)}
}
const stayNights=()=>{const a=new Date(`${$('hotel-checkin').value}T12:00:00`),b=new Date(`${$('hotel-checkout').value}T12:00:00`);return Math.max(1,Math.round((b-a)/86400000))};
function syncHotelSearch(){
  $('hotel-checkin').value=$('depart').value;
  $('hotel-checkout').value=tripType==='round'&&$('return').value?$('return').value:$('depart').value;
  if($('hotel-checkout').value<=$('hotel-checkin').value){const next=new Date(`${$('hotel-checkin').value}T12:00:00`);next.setDate(next.getDate()+1);$('hotel-checkout').value=asDate(next)}
  $('hotel-adults').value=String(Math.min(6,Number($('travelers').value)||1));
}

let currentRenderedStays = [];
let highlightedPartnerId = null;

function getConnectedHotels() {
  try {
    return JSON.parse(localStorage.getItem('smartfly_connected_hotels') || '[]');
  } catch (_) {
    return [];
  }
}

function saveConnectedHotels(hotels) {
  try {
    localStorage.setItem('smartfly_connected_hotels', JSON.stringify(hotels));
  } catch (_) {}
}

function getConnectedHotelStays(nights, rooms) {
  const connected = getConnectedHotels();
  return connected.map((h, i) => {
    const rate = Number(h.rate) || 4500;
    const total = rate * nights * rooms;
    return {
      id: h.id || ('partner-hotel-' + (h.refId || i)),
      refId: h.refId || ('SF-HTL-' + (10000 + i)),
      name: h.hotelName || 'Partner Hotel',
      kind: (h.type ? h.type.replace('-', ' ').toUpperCase() : '4-STAR') + ' Hotel',
      area: (h.city || 'City Centre') + ', ' + (h.state || '') + ' · Verified Hotel Partner',
      city: h.city || '',
      state: h.state || '',
      night: rate,
      rating: (h.type && h.type.includes('5')) ? '5' : (h.type && h.type.includes('3')) ? '3' : '4',
      free: true,
      breakfast: true,
      locationScore: 0,
      tag: 'Verified Partner Property',
      partner: true,
      roomDescription: (h.rooms || 25) + ' Rooms Inventory · Instant Partner Confirmation',
      cancellationText: 'Free cancellation up to 24h before check-in',
      taxNote: 'Taxes included for direct partner booking',
      provider: 'SmartFly Hotel Partner Network',
      totalPerRoom: rate * nights,
      roomQuantity: rooms,
      currency: 'INR',
      live: false,
      demo: true,
      mapUrl: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((h.hotelName || '') + ' ' + (h.city || '')),
      thumbnail: h.image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=480&q=75',
      contact: h.contact,
      phone: h.phone,
      email: h.email
    };
  });
}

function renderHotels(){
  const nights = stayNights(), rooms = Number($('hotel-rooms').value) || 1, inputCity = $('hotel-destination').value.trim(), city = indiaHotelCityAliases[inputCity.toLowerCase()] || inputCity, filter = $('hotel-filter').value, budget = $('hotel-budget-filter').value;
  const headingP = document.querySelector('.hotel-heading p');
  if (headingP) headingP.textContent = `${city || inputCity || 'Choose a destination'} - ${nights} night${nights === 1 ? '' : 's'} - ${$('hotel-adults').value} adult${$('hotel-adults').value === '1' ? '' : 's'} - ${rooms} room${rooms === 1 ? '' : 's'}.`;
  const liveMode = hotelSearchState === 'live', demoMode = hotelSearchState === 'demo';
  const hotelMap = document.querySelector('.hotel-map');
  if (hotelMap) hotelMap.hidden = true;
  const revPriority = document.querySelector('[data-hotel-priority="review"]');
  if (revPriority) revPriority.textContent = liveMode ? 'Hotel category' : 'Top rated';
  const locPriority = document.querySelector('[data-hotel-priority="location"]');
  if (locPriority) locPriority.textContent = liveMode ? 'Nearest city centre' : 'Best location';
  
  // 1. Get real-time connected partner hotels
  const partnerStays = getConnectedHotelStays(nights, rooms);
  
  // Filter partner stays for matching destination if user picked a destination
  const destMatch = (s) => {
    if (!city) return true;
    const dest = city.toLowerCase();
    const sCity = (s.city || '').toLowerCase();
    const sState = (s.state || '').toLowerCase();
    return sCity.includes(dest) || dest.includes(sCity) || sState.includes(dest);
  };
  const matchingPartners = partnerStays.filter(destMatch);
  // Show matching partners, or if none match this city show all partners when no amadeus/demo is active
  const relevantPartners = matchingPartners.length ? matchingPartners : (liveMode || demoMode ? [] : partnerStays);

  const provLabel = document.querySelector('.hotel-provider-label');
  if (provLabel) {
    provLabel.innerHTML = relevantPartners.length && !liveMode
      ? `<i></i> Direct Partner Stays (${relevantPartners.length} Connected)`
      : liveMode
      ? `<i></i> ${hotelProviderEnvironment === 'test' ? 'Amadeus test data - not live' : 'Live Amadeus offers'}`
      : demoMode
      ? '<i></i> Fictional SmartFly AI hotels'
      : '<i></i> Search live offers or show SmartFly AI hotels';
  }

  // 2. Base stays from Amadeus or demo
  let baseStays = (liveMode || demoMode ? liveHotelResults : []).filter(s => (filter === 'all' || filter === 'free' && s.free || filter === 'breakfast' && s.breakfast) && (budget === 'all' || s.totalPerRoom * s.roomQuantity <= Number(budget)));
  baseStays.sort((a,b) => hotelPriority === 'review' ? Number(b.rating || 0) - Number(a.rating || 0) : hotelPriority === 'location' ? a.locationScore - b.locationScore : a.night - b.night);

  // 3. Filtered partner stays (partner properties are always prioritized on top!)
  let filteredPartners = relevantPartners.filter(s => (filter === 'all' || filter === 'free' && s.free || filter === 'breakfast' && s.breakfast) && (budget === 'all' || s.totalPerRoom * s.roomQuantity <= Number(budget)));
  
  let stays = [...filteredPartners, ...baseStays];
  currentRenderedStays = stays;

  if (stays.length && !stays.some(s => s.id === selectedHotel)) selectedHotel = stays[0].id;
  
  $('hotel-list').innerHTML = stays.length ? stays.map((s, i) => {
    const isPartner = Boolean(s.partner);
    const isHighlighted = highlightedPartnerId && (s.id === highlightedPartnerId || s.refId === highlightedPartnerId);
    const total = s.totalPerRoom * s.roomQuantity, price = hotelMoney(total, s.currency || 'INR'), nightPrice = hotelMoney(s.night, s.currency || 'INR');
    const place = `<p class="hotel-area">${escapeHtml(s.area)}</p>${s.mapUrl ? `<a class="hotel-location-link" href="${escapeHtml(s.mapUrl)}" target="_blank" rel="noopener noreferrer">View on map</a>` : ''}`;
    const rating = s.rating ? `<b>${escapeHtml(s.rating)}-star category</b><span>${isPartner ? 'Direct Verified Partner' : 'Guest score not supplied'}</span>` : '<b>Guest rating unavailable</b><span>Not supplied by Amadeus</span>';
    const terms = `<span>${s.free ? 'Free cancellation' : 'Check cancellation policy'}</span><span>${s.breakfast ? 'Breakfast included' : 'Meal plan not specified'}</span>`;
    const reason = `Room: ${escapeHtml(s.roomDescription)}`;
    const more = isPartner 
      ? `SmartFly Verified Hotel Partner Property. Direct integration via SmartFly AI Partner Network. Booking Ref: ${escapeHtml(s.refId)}. Contact: ${escapeHtml(s.contact || '')} (${escapeHtml(s.phone || '')}). ${escapeHtml(s.cancellationText)}.`
      : `${s.demo ? 'SmartFly AI hotel details' : 'Amadeus offer ID: ' + escapeHtml(s.offerId)}. Cancellation: ${escapeHtml(s.cancellationText)}. ${escapeHtml(s.taxNote)}.`;
    
    const tagHtml = isPartner
      ? `<span class="hotel-tag partner-tag">✦ VERIFIED PARTNER PROPERTY</span>`
      : `<span class="hotel-tag ${i === 0 ? 'primary' : ''}">${i === 0 ? (hotelPriority === 'review' ? 'Highest category' : hotelPriority === 'location' ? 'Closest' : 'Best value') : escapeHtml(s.tag)}</span>`;

    return `<article class="hotel-card ${s.id === selectedHotel ? 'selected' : ''} ${isHighlighted ? 'partner-highlight' : ''}" data-hotel-card="${escapeHtml(s.id)}" tabindex="0" aria-label="${escapeHtml(s.name)}, total ${price}">
      <div class="hotel-photo">
        <img class="hotel-thumbnail" src="${escapeHtml(s.thumbnail)}" alt="${escapeHtml(s.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=640&q=80'">
        <div class="hotel-photo-badge">${isPartner ? '⭐ 4.9 Verified Partner' : `⭐ ${escapeHtml(s.rating || '4.8')} Exceptional`}</div>
      </div>
      <div class="hotel-info">
        <div>
          <div class="hotel-card-top">
            <span class="hotel-kind">${escapeHtml(s.kind)}</span>
            ${tagHtml}
          </div>
          <h4>${escapeHtml(s.name)}</h4>
          <div class="hotel-location-row"><span class="pin">📍</span> ${place}</div>
          <div class="hotel-amenities-pills">
            <span class="amenity-pill">🏊 Pool &amp; Spa</span>
            <span class="amenity-pill">📶 High-Speed WiFi</span>
            ${s.breakfast ? '<span class="amenity-pill">🍳 Free Breakfast</span>' : '<span class="amenity-pill">☕ Coffee &amp; Tea</span>'}
            ${s.free ? '<span class="amenity-pill green">✓ Free Cancellation</span>' : '<span class="amenity-pill">⚡ Instant Confirmation</span>'}
          </div>
        </div>
        <p class="hotel-reason">${reason}</p>
      </div>
      <div class="hotel-price">
        <small class="stay-duration-tag">${nights} night${nights === 1 ? '' : 's'}, ${rooms} room${rooms === 1 ? '' : 's'}</small>
        <div class="price-val-wrap">
          <span class="price-strikethrough">₹${Math.round(s.night * 1.35).toLocaleString('en-IN')}</span>
          <b class="price-current">${nightPrice}</b>
          <span class="per-night-label">/ night</span>
        </div>
        <span class="stay-total-label">Total: <strong>${price}</strong> (incl. taxes)</span>
        <span class="deal-pill">${isPartner ? 'Direct Partner Discount' : 'SmartFly Exclusive Fare'}</span>
        <button type="button" class="book-button demo-book-action hotel-primary-book-btn" data-demo-book-hotel="${escapeHtml(s.id)}">${isPartner ? 'Book Partner Rate →' : 'Book This Stay →'}</button>
        <button type="button" class="hotel-details" data-live="${!s.demo && !isPartner}" data-hotel-details="${escapeHtml(s.id)}">${isPartner ? 'Partner info ▾' : s.demo ? 'Room details ▾' : 'Offer details ▾'}</button>
        <div class="hotel-expanded" hidden>${more}</div>
      </div>
    </article>`;
  }).join('') : hotelSearchState === 'loading'
    ? '<div class="empty-results">Searching Amadeus hotel availability and prices...</div>'
    : hotelSearchState === 'error'
    ? `<div class="empty-results">${escapeHtml(hotelSearchError || 'Could not load Amadeus offers. Please try again.')}</div>`
    : liveMode
    ? '<div class="empty-results">Amadeus returned no available hotels for these dates. Try other dates or destination.</div>'
    : demoMode
    ? '<div class="empty-results">No SmartFly AI properties match the selected filters.</div>'
    : '<div class="empty-results">Search Amadeus for current offers, or use “Show SmartFly AI hotels” to preview SmartFly AI properties.</div>';
}

document.querySelectorAll('[data-hotel-priority]').forEach(b=>b.addEventListener('click',()=>{hotelPriority=b.dataset.hotelPriority;selectedHotel='';document.querySelectorAll('[data-hotel-priority]').forEach(x=>x.classList.toggle('active',x===b));renderHotels()}));
$('hotel-filter').addEventListener('change',()=>{selectedHotel='';renderHotels()});$('hotel-budget-filter').addEventListener('change',()=>{selectedHotel='';renderHotels()});

$('hotel-list').addEventListener('click',e=>{
  const book=e.target.closest('[data-demo-book-hotel]');
  if(book){
    const stay = currentRenderedStays.find(s=>s.id===book.dataset.demoBookHotel) || liveHotelResults.find(s=>s.id===book.dataset.demoBookHotel);
    openPassengerDetails('hotel', stay);
    return;
  }
  const details=e.target.closest('[data-hotel-details]');
  if(details){
    const panel=details.parentElement.querySelector('.hotel-expanded');
    panel.hidden=!panel.hidden;
    details.textContent=panel.hidden?(details.dataset.live==='true'?'Offer details':'SmartFly AI stay details'):'Hide details';
    return;
  }
  const card=e.target.closest('[data-hotel-card]');
  if(card){
    selectedHotel=card.dataset.hotelCard;
    updateTripBudget(currentOffers);
    document.querySelectorAll('[data-hotel-card]').forEach(c=>c.classList.toggle('selected',c===card));
    renderHotels();
  }
});

$('hotel-list').addEventListener('keydown',e=>{if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-hotel-card]')){e.preventDefault();e.target.click()}});
syncHotelSearch();
$('hotel-state').addEventListener('change',()=>{$('hotel-destination').value=indiaStateCapitals[$('hotel-state').value];hotelSearchState=null;liveHotelResults=[];$('hotel-api-status').textContent='Search to create fictional SmartFly AI preview stays.';renderHotels()});
$('hotel-demo-preview').addEventListener('click',()=>{const state=$('hotel-state').value,destination=$('hotel-destination').value.trim()||indiaStateCapitals[state];liveHotelResults=createStateDemoHotels(state,destination,stayNights(),Number($('hotel-rooms').value)||1);hotelSearchState='demo';selectedHotel=liveHotelResults[0].id;$('hotel-api-status').textContent=`${liveHotelResults.length} fictional SmartFly AI preview properties for ${destination}, ${state}. These are not real hotels or offers.`;renderHotels();updateTripBudget(currentOffers)});
const syncStayDates=()=>{$('hotel-destination').value=$('destination').value;const match=Object.entries(indiaStateCapitals).find(([,city])=>city.toLowerCase()===$('destination').value.trim().toLowerCase());if(match)$('hotel-state').value=match[0];syncHotelSearch();hotelSearchState=null;liveHotelResults=[];$('hotel-api-status').textContent='Search to create fictional SmartFly AI preview stays.';renderHotels();updateTripBudget(currentOffers)};
$('hotel-search-form').addEventListener('submit',e=>{e.preventDefault();if($('hotel-checkout').value<=$('hotel-checkin').value){$('hotel-checkout').setCustomValidity('Check-out must be after check-in.');$('hotel-checkout').reportValidity();return}$('hotel-checkout').setCustomValidity('');requestLiveHotelOffers()});
['hotel-destination','hotel-checkin','hotel-checkout','hotel-adults','hotel-rooms','hotel-state'].forEach(id=>$(id).addEventListener('change',()=>{$('hotel-checkout').setCustomValidity('');hotelSearchState=null;liveHotelResults=[];$('hotel-api-status').textContent='Search to create fictional SmartFly AI preview stays.';renderHotels();updateTripBudget(currentOffers)}));
renderHotels();
const pageNames=['flights','stays','how-it-works'];
function showPage(page,writeHistory=true){
  if(!pageNames.includes(page))page='flights';
  document.body.dataset.page=page;
  $('search').hidden=page!=='flights';
  $('results').hidden=page==='how-it-works';
  $('how-it-works').hidden=(page!=='how-it-works' && page!=='flights');
  document.querySelector('.hotel-discovery').hidden=page!=='stays';
  
  const trendingSec = document.querySelector('.trending-destinations-section');
  if (trendingSec) trendingSec.hidden = page !== 'flights';
  
  const testimonialsSec = document.querySelector('.testimonials-section');
  if (testimonialsSec) testimonialsSec.hidden = (page !== 'flights' && page !== 'how-it-works');
  
  const trustStrip = document.querySelector('.trust-guarantee-strip');
  if (trustStrip) trustStrip.hidden = (page !== 'flights' && page !== 'how-it-works');

  ['.results-heading','.notice','.filter-bar','.match-panel','.result-list','.results-foot','.trip-budget','.price-history'].forEach(selector=>{
    const element=document.querySelector(selector);
    if(element)element.hidden=page!=='flights';
  });

  if (page === 'stays') {
    if (!liveHotelResults || liveHotelResults.length === 0) {
      const state = $('hotel-state') ? $('hotel-state').value : 'Maharashtra';
      const destination = ($('hotel-destination') && $('hotel-destination').value.trim()) || 'Mumbai';
      liveHotelResults = createStateDemoHotels(state, destination, stayNights(), Number($('hotel-rooms').value) || 1);
      hotelSearchState = 'demo';
      selectedHotel = liveHotelResults[0] ? liveHotelResults[0].id : null;
      renderHotels();
    }
  }
  document.querySelectorAll('[data-page-link]').forEach(link=>{
    const active=link.dataset.pageLink===page;
    if(link.matches('nav a')){
      link.classList.toggle('nav-active',active);
      if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
    }
  });
  if(writeHistory&&location.hash!==`#${page}`)history.pushState(null,'',`#${page}`);
  document.title=`SmartFly AI â€” ${page==='how-it-works'?'How it works':page==='stays'?'Find stays':'Find flights'}`;
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-page-link]').forEach(link=>link.addEventListener('click',event=>{event.preventDefault();showPage(link.dataset.pageLink)}));
window.addEventListener('hashchange',()=>{
  if(location.hash==='#connect-hotel'){
    openConnectHotelModal();
    return;
  }
  showPage(location.hash.slice(1),false);
});
window.addEventListener('popstate',()=>showPage(location.hash.slice(1),false));
$('flight-form').addEventListener('submit',e=>{e.preventDefault();$('flight-search-status').textContent='Preparing illustrative flight prices...';$('results').scrollIntoView({behavior:'smooth',block:'start'});syncStayDates();searchPreviewFlights()});
$('sort').addEventListener('change',renderOffers);
$('cabin').addEventListener('change',invalidateFlightSearch);
$('stops-filter').addEventListener('change',renderOffers);
$('airline-filter').addEventListener('change',renderOffers);
$('clear-filters').addEventListener('click',()=>{$('stops-filter').value='all';$('airline-filter').value='all';renderOffers()});
document.querySelectorAll('.match-option').forEach(button=>button.addEventListener('click',()=>{matchPriority=button.dataset.priority;document.querySelectorAll('.match-option').forEach(option=>option.classList.toggle('active',option===button));renderOffers()}));
document.querySelectorAll('.trip-tab').forEach(button=>button.addEventListener('click',()=>{tripType=button.dataset.trip;document.querySelectorAll('.trip-tab').forEach(b=>b.classList.toggle('selected',b===button));$('return-field').hidden=tripType==='oneway';$('return').required=tripType==='round';syncStayDates();invalidateFlightSearch()}));
$('swap').addEventListener('click',()=>{const a=$('origin').value;$('origin').value=$('destination').value;$('destination').value=a;$('origin-code').textContent=cityCode($('origin').value);$('destination-code').textContent=cityCode($('destination').value);invalidateFlightSearch()});
$('depart').addEventListener('change',()=>{$('return').min=$('depart').value;if($('return').value<$('depart').value)$('return').value=$('depart').value;syncStayDates();invalidateFlightSearch()});
$('origin').addEventListener('change',invalidateFlightSearch);$('destination').addEventListener('change',invalidateFlightSearch);$('travelers').addEventListener('change',invalidateFlightSearch);
$('nearby-airports').addEventListener('change',invalidateFlightSearch);$('flexible-dates').addEventListener('change',invalidateFlightSearch);$('return').addEventListener('change',()=>{updateTripBudget(currentOffers);syncStayDates();invalidateFlightSearch()});
$('dismiss-notice').addEventListener('click',()=>document.querySelector('.notice').remove());
$('demo-book-cancel').addEventListener('click',()=>$('demo-booking-modal').close());
$('passenger-close').addEventListener('click',()=>$('passenger-details-modal').close());
$('passenger-back').addEventListener('click',()=>$('passenger-details-modal').close());
$('welcome-apply-button').addEventListener('click',()=>{
  if(hasWelcomeOfferBeenUsed()) return;
  try{
    localStorage.setItem(WELCOME_OFFER_KEY,'used');
  }catch(error){}
  renderPassengerTotal(selectedBookingMode, selectedBookingItem);
  showToast('Welcome offer applied: 10% off your first booking.', 'success');
});
$('welcome-remove-button').addEventListener('click',()=>{
  try{
    localStorage.removeItem(WELCOME_OFFER_KEY);
  }catch(error){}
  renderPassengerTotal(selectedBookingMode, selectedBookingItem);
  showToast('Welcome offer removed.', 'info');
});
$('passenger-phone').addEventListener('input',event=>{
  event.target.value=event.target.value.replace(/\D/g,'').slice(0,10);
});
$('passenger-travelers').addEventListener('change',()=>{
  renderTravelerFields(getPassengerCount());
  renderPassengerTotal(selectedBookingMode,selectedBookingItem);
});
$('passenger-form').addEventListener('submit',(event)=>{
  event.preventDefault();
  const passengerNames=getTicketPassengerName();
  const passengerCards=Array.from($('passenger-traveler-list').querySelectorAll('.traveler-detail-card'));
  const phone=$('passenger-phone').value.replace(/\D/g,'');
  const namesComplete=passengerCards.every(card=>card.querySelector('[data-traveler-field="first"]').value.trim()&&card.querySelector('[data-traveler-field="last"]').value.trim());
  if(!namesComplete || phone.length!==10){
    showToast('Enter each traveler’s full name and a 10-digit contact phone number to continue.', 'error');
    return;
  }
  $('passenger-details-modal').close();
  openDemoBooking(selectedBookingMode, selectedBookingItem);
  const bookingLabel = selectedBookingMode === 'combo' ? 'trip' : selectedBookingMode === 'flight' ? 'flight' : 'stay';
  $('demo-booking-result').textContent=`Passengers: ${passengerNames} · Contact: ${$('passenger-email').value}, ${$('passenger-phone').value} · ${bookingLabel} preview ready.`;
});
$('demo-book-confirm').addEventListener('click',()=>{
  if(!requireAuth('payment')) return;
  if(!selectedDemoBooking)return;
  $('demo-booking-modal').close();
  openPaymentModal();
});

$('payment-close').addEventListener('click',()=>$('payment-modal').close());
$('payment-modal').addEventListener('click',(event)=>{
  const paymentButton=event.target.closest('.payment-option');
  if(!paymentButton) return;
  renderPaymentForm(paymentButton.dataset.paymentMethod);
});
$('verify-payment').addEventListener('click',()=>{
  if(!validatePaymentDetails()) return;
  $('payment-modal').close();
  openTicketModal();
});
$('download-ticket').addEventListener('click',downloadTicket);
$('close-ticket').addEventListener('click',()=>$('ticket-modal').close());

document.addEventListener('click',(event)=>{
  const requiresAuth=event.target.closest('[data-requires-auth]');
  if(!requiresAuth) return;
  const isLoginLink=event.target.closest('#topbar-login-link');
  if(isLoginLink) return;
  if(!requireAuth('continue')){
    event.preventDefault();
    event.stopPropagation();
  }
});

document.addEventListener('click',(event)=>{
  const bookButton=event.target.closest('.trip-book-button');
  if(!bookButton) return;
  const mode=bookButton.dataset.bookMode || 'flight';
  if(mode==='combo'){
    const stay=liveHotelResults.find(item=>item.id===selectedHotel) || liveHotelResults[0];
    openPassengerDetails('combo', stay || currentOffers[0]);
    return;
  }
  openPassengerDetails('flight', currentOffers[0] || null);
});

const resultList=$('result-list');
if(resultList){
  resultList.addEventListener('click',event=>{
    const button=event.target.closest('[data-flight-details]');
    if(!button) return;
    if(!requireAuth('view flight details')) return;
    const panel=button.nextElementSibling;
    if(panel){
      panel.hidden=!panel.hidden;
      button.textContent=panel.hidden?'Flight fare details':'Hide fare details';
    }
  });
}



let activeSelectedHotelImage = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=640&q=80';
let hotelToUpdateRefId = null;

function updateImagePreview(src, label = 'Custom photo') {
  activeSelectedHotelImage = src;
  const previewImg = $('partner-preview-img');
  const sourceNote = $('partner-img-source-note');
  if (previewImg) previewImg.src = src;
  if (sourceNote) sourceNote.textContent = 'Selected: ' + label;
}

const PARTNER_SESSION_KEY = 'smartfly_partner_session';
const PARTNER_REGISTRY_KEY = 'smartfly_partner_registry';

// Default App Owner master / provisioned keys
const DEFAULT_PARTNER_MASTER_KEYS = [
  'SMARTFLY-PARTNER-2026',
  'OWNER-HOTEL-7788',
  'SF-HOTEL-PRO'
];

function getPartnerRegistry() {
  try {
    const raw = localStorage.getItem(PARTNER_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePartnerRegistry(list) {
  try {
    localStorage.setItem(PARTNER_REGISTRY_KEY, JSON.stringify(list));
  } catch {}
}

function getActivePartnerSession() {
  try {
    const raw = localStorage.getItem(PARTNER_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setPartnerSession(session) {
  try {
    if (session) {
      localStorage.setItem(PARTNER_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(PARTNER_SESSION_KEY);
    }
  } catch {}
  updateTopbarPartnerState();
}

function updateTopbarPartnerState() {
  const session = getActivePartnerSession();
  const btn = $('topbar-connect-hotel-btn');
  if (btn) {
    if (session) {
      const displayId = session.partnerId.length > 12 ? session.partnerId.slice(0, 10) + '…' : session.partnerId;
      btn.innerHTML = '<span>🏨</span> Partner: ' + escapeHtml(displayId);
      btn.title = 'Authenticated Partner (' + session.partnerId + ')';
      btn.classList.add('partner-active');
    } else {
      btn.innerHTML = '<span>🏨</span> Connect your hotel';
      btn.title = 'Connect your hotel property';
      btn.classList.remove('partner-active');
    }
  }
}

function showGateView(view) {
  const loginTab = $('tab-gate-login');
  const regTab = $('tab-gate-register');
  const loginView = $('gate-login-view');
  const regView = $('gate-register-view');
  const certView = $('gate-cert-view');

  if (view === 'login') {
    if (loginTab) loginTab.classList.add('active');
    if (regTab) regTab.classList.remove('active');
    if (loginView) loginView.hidden = false;
    if (regView) regView.hidden = true;
    if (certView) certView.hidden = true;
  } else if (view === 'register') {
    if (regTab) regTab.classList.add('active');
    if (loginTab) loginTab.classList.remove('active');
    if (regView) regView.hidden = false;
    if (loginView) loginView.hidden = true;
    if (certView) certView.hidden = true;
  } else if (view === 'cert') {
    if (regView) regView.hidden = true;
    if (loginView) loginView.hidden = true;
    if (certView) certView.hidden = false;
  }
}

function openConnectHotelModal() {
  const modal = document.getElementById('connect-hotel-modal');
  if (!modal) return;
  
  const session = getActivePartnerSession();
  const gate = document.getElementById('partner-security-gate');
  const dashboard = document.getElementById('partner-authorized-dashboard');

  if (!session) {
    if (gate) gate.hidden = false;
    if (dashboard) dashboard.hidden = true;
    showGateView('login');
  } else {
    if (gate) gate.hidden = true;
    if (dashboard) dashboard.hidden = false;

    // Update badges
    const idBadge = $('active-partner-id-badge');
    const propBadge = $('active-partner-property-badge');
    if (idBadge) idBadge.textContent = session.partnerId;
    if (propBadge) propBadge.textContent = session.hotelName || 'Verified SmartFly AI Hotelier';

    const form = document.getElementById('connect-hotel-form');
    const successBox = document.getElementById('connect-hotel-success');
    const managePanel = document.getElementById('partner-manage-panel');
    if (form) form.hidden = false;
    if (successBox) successBox.hidden = true;
    if (managePanel) managePanel.hidden = true;

    // Pre-fill form from session registration if empty
    if ($('partner-hotel-name') && session.hotelName && !$('partner-hotel-name').value) {
      $('partner-hotel-name').value = session.hotelName;
    }
    if ($('partner-hotel-city') && session.city && !$('partner-hotel-city').value) {
      $('partner-hotel-city').value = session.city;
    }
    if ($('partner-hotel-state') && session.state) {
      $('partner-hotel-state').value = session.state;
    }
    if ($('partner-hotel-type') && session.type) {
      $('partner-hotel-type').value = session.type;
    }
    if ($('partner-rooms-count') && session.rooms) {
      $('partner-rooms-count').value = session.rooms;
    }
    if ($('partner-base-rate') && session.rate) {
      $('partner-base-rate').value = session.rate;
    }
    if ($('partner-contact-name') && session.ownerName && !$('partner-contact-name').value) {
      $('partner-contact-name').value = session.ownerName;
    }
    if ($('partner-contact-phone') && session.phone && !$('partner-contact-phone').value) {
      $('partner-contact-phone').value = session.phone;
    }
    if ($('partner-contact-email') && session.email && !$('partner-contact-email').value) {
      $('partner-contact-email').value = session.email;
    }

    // Activate first tab
    const tabNew = $('tab-connect-new');
    const tabManage = $('tab-manage-hotels');
    if (tabNew) tabNew.classList.add('active');
    if (tabManage) tabManage.classList.remove('active');

    renderManageHotelsList();
  }

  modal.showModal();
}

function renderManageHotelsList() {
  const hotels = getConnectedHotels();
  const countEl = $('partner-hotels-count');
  if (countEl) countEl.textContent = String(hotels.length);

  const listEl = $('partner-hotels-list');
  if (!listEl) return;

  if (!hotels.length) {
    listEl.innerHTML = '<div class="empty-partner-box">🏨 You haven\'t connected any hotels yet.<br>Use the "Connect New Hotel" tab to add your property!</div>';
    return;
  }

  listEl.innerHTML = hotels.map(h => {
    return `<div class="partner-hotel-item" data-hotel-ref="${escapeHtml(h.refId)}">
      <div class="partner-hotel-thumb">
        <img src="${escapeHtml(h.image || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=480&q=75')}" alt="${escapeHtml(h.hotelName)}" loading="lazy">
      </div>
      <div class="partner-hotel-details">
        <h4>${escapeHtml(h.hotelName)}</h4>
        <p>${escapeHtml(h.city)}, ${escapeHtml(h.state)} · ${escapeHtml(h.type || 'Hotel')}</p>
        <small>Listed Rate: ₹${Number(h.rate || 4500).toLocaleString('en-IN')}/night · ID: ${escapeHtml(h.refId)}</small>
      </div>
      <div class="partner-hotel-actions">
        <button type="button" class="update-photo-btn" data-trigger-update-photo="${escapeHtml(h.refId)}">📸 Update Photo</button>
        <button type="button" class="view-stay-btn" data-view-stay-target="${escapeHtml(h.refId)}">View in Stays</button>
      </div>
    </div>`;
  }).join('');
}

let newlyRegisteredPartner = null;

function initConnectHotel() {
  updateTopbarPartnerState();

  const openBtn = document.getElementById('topbar-connect-hotel-btn');
  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openConnectHotelModal();
    });
  }

  const staysBtn = document.getElementById('stays-connect-hotel-btn');
  if (staysBtn) {
    staysBtn.addEventListener('click', (e) => {
      e.preventDefault();
      openConnectHotelModal();
    });
  }

  document.querySelectorAll('[data-open-hotel-connect]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      openConnectHotelModal();
    });
  });

  // Security Gate Tabs
  const gateLoginTab = $('tab-gate-login');
  const gateRegTab = $('tab-gate-register');
  const switchToRegBtn = $('switch-to-register-btn');
  const regBackToLogin = $('reg-back-to-login');

  if (gateLoginTab) gateLoginTab.addEventListener('click', () => showGateView('login'));
  if (gateRegTab) gateRegTab.addEventListener('click', () => showGateView('register'));
  if (switchToRegBtn) switchToRegBtn.addEventListener('click', () => showGateView('register'));
  if (regBackToLogin) regBackToLogin.addEventListener('click', () => showGateView('login'));

  // Quick Master Key Chips Auto-fill
  document.querySelectorAll('.key-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const authInput = $('partner-auth-id');
      if (authInput) {
        authInput.value = chip.dataset.key;
        authInput.focus();
        showToast('Auto-filled: ' + chip.dataset.key, 'info');
      }
    });
  });

  // Partner Login / Verify User ID
  const partnerLoginForm = $('partner-login-form');
  if (partnerLoginForm) {
    partnerLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredId = $('partner-auth-id').value.trim();
      if (!enteredId) {
        showToast('Please enter a Partner User ID.', 'error');
        return;
      }

      const isMasterKey = DEFAULT_PARTNER_MASTER_KEYS.some(k => k.toLowerCase() === enteredId.toLowerCase());
      const registry = getPartnerRegistry();
      const matchedRegistered = registry.find(p => p.partnerId.toLowerCase() === enteredId.toLowerCase());

      if (isMasterKey || matchedRegistered) {
        const sessionData = matchedRegistered || {
          partnerId: enteredId.toUpperCase(),
          hotelName: 'SmartFly Hotelier Partner',
          ownerName: 'Authorized Manager',
          phone: '',
          email: '',
          city: '',
          state: '',
          authorizedAt: new Date().toISOString()
        };

        setPartnerSession(sessionData);
        showToast('✓ Partner User ID verified! Welcome to Extranet.', 'success');
        openConnectHotelModal();
      } else {
        showToast('❌ Invalid Partner User ID. Ask the app owner or register below.', 'error');
      }
    });
  }

  // Partner Registration Form Submission
  const partnerRegForm = $('partner-register-form');
  if (partnerRegForm) {
    partnerRegForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const hotelName = $('reg-hotel-name').value.trim();
      const ownerName = $('reg-owner-name').value.trim();
      const phone = $('reg-phone').value.replace(/\D/g, '');
      const email = $('reg-email').value.trim();
      const city = $('reg-city').value.trim();
      const state = $('reg-state').value;
      const type = $('reg-type').value;
      const rooms = $('reg-rooms').value;
      const rate = $('reg-rate').value;
      const taxId = $('reg-tax-id').value.trim();

      if (phone.length !== 10) {
        showToast('Please enter a valid 10-digit mobile phone number.', 'error');
        return;
      }

      // Generate verified Partner User ID
      const generatedPartnerId = 'SF-HTL-' + Math.floor(1000 + Math.random() * 9000);

      newlyRegisteredPartner = {
        partnerId: generatedPartnerId,
        hotelName,
        ownerName,
        phone,
        email,
        city,
        state,
        type,
        rooms,
        rate,
        taxId,
        registeredAt: new Date().toISOString()
      };

      // Save to Partner Registry
      const registry = getPartnerRegistry();
      registry.push(newlyRegisteredPartner);
      savePartnerRegistry(registry);

      // Render Certificate View
      $('newly-issued-partner-id').textContent = generatedPartnerId;
      $('cert-property-summary').innerHTML = `
        <div><strong>Property:</strong> ${escapeHtml(hotelName)}</div>
        <div><strong>Location:</strong> ${escapeHtml(city)}, ${escapeHtml(state)}</div>
        <div><strong>Owner/Manager:</strong> ${escapeHtml(ownerName)}</div>
        <div><strong>Contact:</strong> ${escapeHtml(phone)} · ${escapeHtml(email)}</div>
      `;

      showGateView('cert');
      showToast('🎉 Registration approved! Partner ID: ' + generatedPartnerId, 'success');
    });
  }

  // Copy Partner ID button
  const copyBtn = $('copy-partner-id-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const id = $('newly-issued-partner-id').textContent.trim();
      if (navigator.clipboard) {
        navigator.clipboard.writeText(id);
      }
      showToast('✓ Partner User ID copied to clipboard: ' + id, 'success');
    });
  }

  // Enter Extranet from Certificate
  const enterExtranetBtn = $('enter-extranet-btn');
  if (enterExtranetBtn) {
    enterExtranetBtn.addEventListener('click', () => {
      if (newlyRegisteredPartner) {
        setPartnerSession(newlyRegisteredPartner);
      }
      openConnectHotelModal();
      showToast('🚀 Extranet opened! Complete your photo upload and publish.', 'success');
    });
  }

  // Partner Lock / Logout
  const lockBtn = $('partner-logout-btn');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      setPartnerSession(null);
      showToast('🔒 Partner session locked.', 'info');
      openConnectHotelModal();
    });
  }

  // Tab switching inside authorized dashboard
  const tabNew = $('tab-connect-new');
  const tabManage = $('tab-manage-hotels');
  const form = $('connect-hotel-form');
  const managePanel = $('partner-manage-panel');
  const successBox = $('connect-hotel-success');

  if (tabNew && tabManage) {
    tabNew.addEventListener('click', () => {
      tabNew.classList.add('active');
      tabManage.classList.remove('active');
      if (form) form.hidden = false;
      if (managePanel) managePanel.hidden = true;
      if (successBox) successBox.hidden = true;
    });

    tabManage.addEventListener('click', () => {
      tabManage.classList.add('active');
      tabNew.classList.remove('active');
      if (form) form.hidden = true;
      if (managePanel) managePanel.hidden = false;
      if (successBox) successBox.hidden = true;
      renderManageHotelsList();
    });
  }

  // File Upload Handling
  const fileInput = $('partner-hotel-file');
  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) {
        if (!file.type.startsWith('image/')) {
          showToast('Please select a valid image file (JPG, PNG, WebP).', 'error');
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          updateImagePreview(evt.target.result, file.name);
          showToast('✓ Picture loaded: ' + file.name, 'success');
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // URL apply button
  const urlBtn = $('partner-apply-url-btn');
  if (urlBtn) {
    urlBtn.addEventListener('click', () => {
      const val = $('partner-hotel-image-url').value.trim();
      if (!val) {
        showToast('Please enter an image URL.', 'error');
        return;
      }
      updateImagePreview(val, 'Custom image link');
      showToast('✓ Photo URL applied.', 'success');
    });
  }

  // Sample presets
  document.querySelectorAll('.preset-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      updateImagePreview(btn.dataset.img, btn.textContent);
      showToast('✓ Selected: ' + btn.textContent, 'info');
    });
  });

  // Clear / reset image
  const clearImgBtn = $('partner-clear-img-btn');
  if (clearImgBtn) {
    clearImgBtn.addEventListener('click', () => {
      updateImagePreview('https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=640&q=80', 'Default Luxury Resort');
      if ($('partner-hotel-image-url')) $('partner-hotel-image-url').value = '';
      if ($('partner-hotel-file')) $('partner-hotel-file').value = '';
    });
  }

  // Updating existing hotel photo from "Manage My Hotels" tab
  const updateFileInput = $('update-hotel-file-input');
  if (updateFileInput) {
    updateFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file && hotelToUpdateRefId) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const newImg = evt.target.result;
          const hotels = getConnectedHotels();
          const target = hotels.find(h => h.refId === hotelToUpdateRefId);
          if (target) {
            target.image = newImg;
            saveConnectedHotels(hotels);
            renderManageHotelsList();
            renderHotels();
            showToast('✓ Updated photo for "' + target.hotelName + '"! Stays section updated.', 'success');
          }
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const manageList = $('partner-hotels-list');
  if (manageList) {
    manageList.addEventListener('click', (e) => {
      const updatePhotoBtn = e.target.closest('[data-trigger-update-photo]');
      if (updatePhotoBtn) {
        hotelToUpdateRefId = updatePhotoBtn.dataset.triggerUpdatePhoto;
        if (updateFileInput) {
          updateFileInput.value = '';
          updateFileInput.click();
        }
        return;
      }

      const viewBtn = e.target.closest('[data-view-stay-target]');
      if (viewBtn) {
        const refId = viewBtn.dataset.viewStayTarget;
        const hotels = getConnectedHotels();
        const target = hotels.find(h => h.refId === refId);
        if (target) {
          document.getElementById('connect-hotel-modal').close();
          showPage('stays');
          if (target.city) $('hotel-destination').value = target.city;
          if (target.state) $('hotel-state').value = target.state;
          highlightedPartnerId = target.refId;
          renderHotels();
          setTimeout(() => {
            const el = document.querySelector('[data-hotel-card*="' + target.refId + '"]');
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 300);
        }
      }
    });
  }

  const closeBtn = document.getElementById('connect-hotel-close');
  if (closeBtn) closeBtn.addEventListener('click', () => document.getElementById('connect-hotel-modal').close());

  const cancelBtn = document.getElementById('connect-hotel-cancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => document.getElementById('connect-hotel-modal').close());

  const doneBtn = document.getElementById('connect-hotel-done');
  if (doneBtn) doneBtn.addEventListener('click', () => document.getElementById('connect-hotel-modal').close());

  // 1-Click "View in Stays Section" from confirmation box
  const viewInStaysBtn = $('view-in-stays-btn');
  if (viewInStaysBtn) {
    viewInStaysBtn.addEventListener('click', () => {
      $('connect-hotel-modal').close();
      showPage('stays');
      const hotels = getConnectedHotels();
      const latest = hotels[hotels.length - 1];
      if (latest) {
        if (latest.city) $('hotel-destination').value = latest.city;
        if (latest.state) $('hotel-state').value = latest.state;
        highlightedPartnerId = latest.refId;
        renderHotels();
        setTimeout(() => {
          const el = document.querySelector('[data-hotel-card*="' + latest.refId + '"]');
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
  }

  // Form submission: save connected hotel with pictures & immediately reflect in Stays
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const hotelName = document.getElementById('partner-hotel-name').value.trim();
      const city = document.getElementById('partner-hotel-city').value.trim();
      const state = document.getElementById('partner-hotel-state').value;
      const session = getActivePartnerSession();
      const refId = session?.partnerId || ('SF-HTL-' + Math.floor(10000 + Math.random() * 90000));

      const partnership = {
        id: 'partner-hotel-' + refId,
        refId,
        hotelName,
        city,
        state,
        type: document.getElementById('partner-hotel-type').value,
        channel: document.getElementById('partner-channel-manager').value,
        rooms: document.getElementById('partner-rooms-count').value,
        rate: document.getElementById('partner-base-rate').value,
        contact: document.getElementById('partner-contact-name').value.trim(),
        phone: document.getElementById('partner-contact-phone').value.trim(),
        email: document.getElementById('partner-contact-email').value.trim(),
        image: activeSelectedHotelImage,
        connectedAt: new Date().toISOString()
      };

      const stored = getConnectedHotels();
      const existingIdx = stored.findIndex(h => h.refId === refId);
      if (existingIdx !== -1) {
        stored[existingIdx] = partnership;
      } else {
        stored.push(partnership);
      }
      saveConnectedHotels(stored);

      highlightedPartnerId = refId;
      renderHotels();
      renderManageHotelsList();

      form.hidden = true;
      if (successBox) {
        successBox.hidden = false;
        document.getElementById('connect-hotel-badge').textContent = 'Partner ID: ' + refId + ' • Listed in Stays Section';
        document.getElementById('connect-hotel-success-msg').textContent = 'Success! "' + hotelName + '" has been connected and automatically published to the Stays section with your selected photos and pricing.';
      }
      showToast('🏨 "' + hotelName + '" connected and added to Stays!', 'success');
    });
  }

  if (location.hash === '#connect-hotel') {
    openConnectHotelModal();
  }
}
initConnectHotel();
showPage(location.hash.slice(1)||'flights',false);
search();
searchPreviewFlights();

// Interactive Trending Destination Chips & Cards
function initTrendingInteractions() {
  // 1. Trending Route Chips in Hero
  document.querySelectorAll('.route-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const dest = btn.dataset.dest;
      const code = btn.dataset.destCode;
      if (dest) {
        $('destination').value = dest;
        $('destination-code').textContent = code || cityCode(dest);
        syncStayDates();
        searchPreviewFlights();
        showToast('✈️ Route set to ' + dest + '! Comparing lowest fares...', 'info');
        $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 2. Destination Cards
  document.querySelectorAll('.dest-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const dest = card.dataset.exploreDest;
      const code = card.dataset.exploreCode;
      if (dest) {
        $('destination').value = dest;
        $('destination-code').textContent = code || cityCode(dest);
        syncStayDates();
        searchPreviewFlights();
        showToast('🌴 Exploring ' + dest + '! Preparing fares & stays...', 'success');
        $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // 3. Festive Offer Claim Button
  const claimBtn = $('claim-festive-btn');
  if (claimBtn) {
    claimBtn.addEventListener('click', () => {
      showToast('🎉 SMARTFLY15 Applied! Extra 15% discount unlocked on your trip.', 'success');
      const welcomeBtn = $('welcome-apply-button');
      if (welcomeBtn) welcomeBtn.click();
      $('flight-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
}

initTrendingInteractions();

function initStaysInteractions() {
  document.querySelectorAll('.stay-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.stay-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      const dest = chip.dataset.dest;
      const state = chip.dataset.state;
      if ($('hotel-destination')) $('hotel-destination').value = dest;
      if ($('hotel-state')) $('hotel-state').value = state;
      
      liveHotelResults = createStateDemoHotels(state, dest, stayNights(), Number($('hotel-rooms').value) || 1);
      hotelSearchState = 'demo';
      selectedHotel = liveHotelResults[0] ? liveHotelResults[0].id : null;
      const statusEl = $('hotel-api-status');
      if (statusEl) statusEl.textContent = `Showing verified luxury stays and partner properties for ${dest}, ${state}.`;
      renderHotels();
      updateTripBudget(currentOffers);
      showToast(`Showing luxury stays in ${dest} 🏨`, 'success');
    });
  });

  const connectBtn = $('stays-connect-hotel-btn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      const modal = $('connect-hotel-modal');
      if (modal) {
        modal.showModal();
        if (typeof initPartnerModalState === 'function') initPartnerModalState();
      }
    });
  }
}

initStaysInteractions();
