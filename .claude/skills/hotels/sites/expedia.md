# Expedia Hotels — UI Navigation

URL: https://www.expedia.com/Hotels

## Steps

1. Navigate to the URL. Origin may be pre-filled — verify destination is empty or clear it.
2. **Destination**: Click "Going to" and type the city or neighborhood. Select from dropdown.
3. **Dates**: Click the dates field. Calendar opens — navigate with ">" at approximately (1171, 245). Click check-in date, then check-out date, then "Done".
4. **Travelers/Rooms**: Click the travelers field. Picker opens with "+" buttons for Adults (~993, 265) and Rooms. Click "+" once per additional adult (e.g., 3 clicks for 1 → 4). Click "Done". **Faster alternative**: use `javascript_tool` to set counts directly.
5. Click "Search".

## Reading Results

- Prices are shown **per night** — multiply by nights and rooms for total.
- Filter by "Guest rating" or sort by "Price (low to high)" to surface best options quickly.
- Expedia shows both hotels and vacation rentals — note the property type for each result.
