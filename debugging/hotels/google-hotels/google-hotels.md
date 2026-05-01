

-- The site includes query paramters with specified settings.
The search bar contains the address to the Databricks AI Summit I want hotels near that area. 

site=https://www.google.com/travel/search?q=747%20Howard%20Street%2C%20San%20Francisco%2C%20CA%2094103&gsas=1&ts=CAEqCQoFOgNVU0QaAA&qs=CAAgACgASAA&ap=KigKEglz30V6G-NCQBHPu1bMn5pewBISCahzVzO65UJAEc-7VgJcmV7AMABIAboBBnByaWNlcw&sa=X&hl=en&g2lb=2502548%2C2503771%2C2503781%2C4258168%2C4284970%2C4757164%2C4814050%2C4864715%2C4874190%2C4886480%2C4893075%2C4924070%2C4965990%2C4990494%2C72266483%2C72266484%2C72298667%2C72302247%2C72317059%2C72321071%2C72332111%2C72364090&ved=0CAAQ5JsGahgKEwjoqPvOj5iUAxUAAAAAHQAAAAAQ6AQ

The search returns a list of cards
![alt text](image.png)

container:
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz

card: 
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz/c-wiz[3]/div

What I would ideally like to do is click into the top 8 cards to view prices
#id > c-wiz > c-wiz:nth-child(5) > div > div > div > div.kCsInf.ZJqrAd.qiy8jf > div > div.eDlCVd.kUqfed > div.XKB4Sc.Pf7YId > div > a > button

it will route yo to a page similar to this link:
https://www.google.com/travel/search?q=747%20Howard%20Street%2C%20San%20Francisco%2C%20CA%2094103&gsas=1&ts=CAESCgoCCAMKAggDEAAaMQoTEg8KDS9nLzExZ3IzNmhobnQaABIaEhQKBwjqDxAGGA8SBwjqDxAGGBIYAzICCAIqDQoFOgNVU0QaACICGAE&qs=CAEgACgAMidDaGtJemViaTRlVDV1WTlvR2cwdlp5OHhNWFl6ZW5aNE1UQTNFQUU4DUgA&ap=KigKEglz30V6G-NCQBHPu1a8kZpewBISCahzVzO65UJAEc-7VhJqmV7AMABIAboBBnByaWNlcw&sa=X&hl=en&g2lb=2502548%2C2503771%2C2503781%2C4258168%2C4284970%2C4757164%2C4814050%2C4864715%2C4874190%2C4886480%2C4893075%2C4924070%2C4965990%2C4990494%2C72266483%2C72266484%2C72298667%2C72302247%2C72317059%2C72321071%2C72332111%2C72364090&ved=0CAAQ5JsGahgKEwjoqPvOj5iUAxUAAAAAHQAAAAAQjgg



There is a drop down to change the price displayed. Let's change it to Stay Total
Here is the new URL slug in case that actually gets appended to the url
https://www.google.com/travel/search?q=747%20Howard%20Street%2C%20San%20Francisco%2C%20CA%2094103&gsas=1&ts=CAESCgoCCAMKAggDEAAaMQoTEg8KDS9nLzExZ3IzNmhobnQaABIaEhQKBwjqDxAGGA8SBwjqDxAGGBIYAzICCAIqDQoFOgNVU0QaACICGAE&qs=CAEgACgAMidDaGtJemViaTRlVDV1WTlvR2cwdlp5OHhNWFl6ZW5aNE1UQTNFQUU4DUgA&ap=KigKEglz30V6G-NCQBHPu1a8kZpewBISCahzVzO65UJAEc-7VhJqmV7AMABIAboBBnByaWNlcw&sa=X&hl=en&g2lb=2502548%2C2503771%2C2503781%2C4258168%2C4284970%2C4757164%2C4814050%2C4864715%2C4874190%2C4886480%2C4893075%2C4924070%2C4965990%2C4990494%2C72266483%2C72266484%2C72298667%2C72302247%2C72317059%2C72321071%2C72332111%2C72364090&ved=0CAAQ5JsGahgKEwjoqPvOj5iUAxUAAAAAHQAAAAAQjgg

Otherwise here is the modal: #yDmH0d > div.llhEMd.iWO5td > div > div.g3VIld.Fqio0e.CpaX6.Up8vH.J9Nfi.iWO5td
![alt text](image-2.png)


This is the main container for the options:
#prices > c-wiz.K1smNd > c-wiz.tuyxUe > div > section > div.A5WLXb.q3c9pf.lEjuQe > c-wiz > div

Ignore the "Sponsored options"
![alt text](image-1.png)

Select all the price options for this hotel.
This is an example of a card
#prices > c-wiz.K1smNd > c-wiz.tuyxUe > div > section > div.A5WLXb.q3c9pf.lEjuQe > c-wiz > div > div > div.R09YGb.WCYWbc > div.vxYgIc.fLiu5d > span > div:nth-child(1)
