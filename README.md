# SmartFly AI

## Run the app

1. Open a terminal in the SmartFlyAI project folder.
2. Run `npm start` and leave that terminal open.
3. Open `http://localhost:3000` in your browser.

Run the Node server to use the app at `http://localhost:3000`. Hotel provider searches require this server; the flight preview prices are generated in the browser and do not call an online flight API.

## Flight search

Flight search displays clearly labeled SmartFly AI illustrative prices for airlines such as IndiGo, Air India, Air India Express, Akasa Air, and SpiceJet. The lowest sample price is highlighted. These generated prices and schedules are not live fares, real flight availability, or bookable offers. The three-month guide is illustrative and is not a fare prediction.

## Hotel search

The hotel search form posts destination, dates, adult count, room count, and India country code to `POST /api/hotels/search`. The server keeps Amadeus credentials private, gets an OAuth token, resolves the city, finds nearby hotels, then requests available Hotel Offers V3 and returns prices, room/cancellation details, and coordinates for map links. Hotel results are provider offers; the page labels Amadeus test-environment data separately from production results.

Copy `.env.example` to `.env`, provide active `AMADEUS_CLIENT_ID` and `AMADEUS_CLIENT_SECRET` credentials for these endpoints, select the environment supported by your account, and restart the server. Without credentials, live search displays a setup or provider error. Amadeus announced that its Self-Service developer portal was decommissioned on July 17, 2026; new access may require Enterprise onboarding, and these existing Self-Service endpoints may not be available with Enterprise credentials. Use **Show sample hotels** to view 12 clearly fictional sample properties for each of India's 28 states.

Each state assigns a varied set of 12 Unsplash stock hotel thumbnails across its 12 sample listings; the assignments vary by state and city. Photos need an internet connection and are illustrative, not verified images of those properties. Flight results and the simulated sample booking flow remain fictional. SmartFly does not create hotel reservations or collect payment.
