
## New updates section
-- The site includes query paramters with specified settings.
The search bar contains the address to the Databricks AI Summit I want hotels near that area. 

site=https://www.google.com/travel/search?q=747%20Howard%20Street%2C%20San%20Francisco%2C%20CA%2094103&gsas=1&ts=CAEqCQoFOgNVU0QaAA&qs=CAAgACgASAA&ap=KigKEglz30V6G-NCQBHPu1bMn5pewBISCahzVzO65UJAEc-7VgJcmV7AMABIAboBBnByaWNlcw&sa=X&hl=en&g2lb=2502548%2C2503771%2C2503781%2C4258168%2C4284970%2C4757164%2C4814050%2C4864715%2C4874190%2C4886480%2C4893075%2C4924070%2C4965990%2C4990494%2C72266483%2C72266484%2C72298667%2C72302247%2C72317059%2C72321071%2C72332111%2C72364090&ved=0CAAQ5JsGahgKEwjoqPvOj5iUAxUAAAAAHQAAAAAQ6AQ

The search returns a list of cards
![alt text](image.png)

container:
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz

cards example
-- first card
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz/c-wiz[3]

-- second card
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz/c-wiz[3]

card container
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz/c-wiz[3]/div/div/div

This is the card pricing details shown on the first page
/html/body/c-wiz[2]/div/c-wiz/div[1]/div[1]/div[2]/div[2]/main/c-wiz/span/c-wiz/c-wiz[3]/div/div/div/div[1]/div/div[1]/div[2]/div/a/div/div/div/span[1]/span/span[2]/span[2]/div
<div class="S52znb sSHqwe"><div class="CQYfx UDzrdc">$703 nightly</div><div class="CQYfx X8YPd"></div><div class="CQYfx UDzrdc">$3,287 total</div><div class="CQYfx">4 nights with taxes + fees</div></div>


Lets just make sure we're getting the total price every single time. 
We will still need to click each card to obtain:
- Name of hotel if we don't already have it
- Address,
- Link - I notice the link takes you to the actual site of the price but I think I'd prefer the link to the google hotels result assuming the query parameters show the proper details:
https://www.google.com/travel/search?q=747%20Howard%20Street%2C%20San%20Francisco%2C%20CA%2094103&gsas=1&ts=CAESBgoCCAMQARoxChMSDwoNL2cvMTFncjM2aGhudBoAEhoSFAoHCOoPEAYYDhIHCOoPEAYYEhgEMgIIAioJCgU6A1VTRBoA&qs=CAEgACgAMidDaGtJektDQTV1TDM3TlZ1R2cwdlp5OHhNWFJxY0hwc1p6RjRFQUU4DUgA&ap=KigKEgnOJz6m1dlCQBGnMm1A3Z5ewBISCT_8rXzL7kJAEacybfC-lF7AMABIAQ&sa=X&hl=en&g2lb=2502548%2C2503771%2C2503781%2C4258168%2C4284970%2C4757164%2C4814050%2C4864715%2C4874190%2C4886480%2C4893075%2C4924070%2C4965990%2C4990494%2C72266483%2C72266484%2C72298667%2C72302247%2C72317059%2C72321071%2C72332111%2C72364090&ved=0CAAQ5JsGahgKEwjg5rOekZuUAxUAAAAAHQAAAAAQyQM
- If it is relatively simple we could provide the name of the vendor that is offering the lowest price.



---

## Implementation findings (2026-05-01)

### What works
- Direct `?q=<address>` URL bypasses the homepage form (no need to click into search box).
- Hotel card detail navigation works via `card.querySelector('a[href*="/travel/"]').href` + `page.goto(href)`.
  - Programmatic `el.click()` is **ignored** by Google's jsaction handlers — synthetic clicks are filtered out everywhere on this page.
- Stay Total **dropdown trigger** is reliably located via structural CSS selector (XPath indices vary per hotel):
  - `section span > span > span > button` (filtered to one whose text matches `/night|total|stay/i`)
  - User-confirmed XPath samples (different across hotels): `.../span[1]/c-wiz[1]/c-wiz[3]/.../button` and `.../span[2]/c-wiz[1]/c-wiz[1]/.../button` — same shape, different indices.
  - Clicking via Playwright `locator.click()` (real mouse) DOES open the modal.
- Modal opens as a portal-mounted dialog at `body > div[N]` (typically `div[7]`) with TWO `[role="dialog"]` wrappers.
- Modal contains 3 price-display labels followed by ~78 currency labels:
  - `label[0]`: "Nightly price with fees Excludes taxes"
  - `label[1]`: "Nightly total Nightly price with taxes + fees"
  - `label[2]`: "Stay total Price for N nights with taxes + fees" ← what we want
- Done button (commits the modal): `body > div > div > div > div > div > button` filtered to text `Done`.

### Breakthrough — Stay Total dropdown is a red herring
Tried every click strategy on the "Stay total" `<label>`:
- Inner `<span>` click via Playwright `force: true`
- `page.mouse.click(x, y)` on label bounding-box center
- Modal trigger ("Nightly price with fees" button) opens correctly + Done click commits

**Prices in `#prices` never change.** Sampled `#prices[1].textContent` before / after-inner-span-click / after-mouse-xy-click / after-done — all identical: `$83 $97 $388 $89 $104 ...`.

**Why the click "doesn't work":** It actually does — but the dropdown only changes which dollar value is *visually highlighted*. The DOM **always contains all three values per row** for every option:

```
Expedia.com $83 $97 $388 Visit site
Standard Room ... $83 $97 $388 Visit site
Standard Room ... $89 $104 $416 Visit site
Standard Room ... $111 $131 $523 Visit site
```

- `$83` = nightly base (no fees)
- `$97` = nightly with taxes & fees (= $83 + ~$14)
- `$388` = stay total (= $97 × 4 nights) ← what we want

So the modal switch is **not needed**. We can extract the stay total directly via the triple-dollar pattern.

### Other gotchas worth remembering
- There are **TWO `#prices` elements on the page** (Google reuses the id):
  - `#prices[0]` = title heading ("Prices", 6 chars textContent)
  - `#prices[1]` = the actual data section (~12k chars textContent)
  - Use `document.querySelectorAll('#prices')[1]` to reach the data.
- `#prices.innerText` returns 6 chars (only the heading is rendered text). `textContent` correctly returns descendant text including all dollar values.
- `<label>` elements in the modal have `role="presentation"` + `jslog="...;track:click"` — pure custom Google components, no native `<input type="radio">`. Clicks fire jsaction but only update visual highlighting in this case.

### Final scraping approach
1. Navigate to hotel detail page via the SERP card's `<a href>`.
2. Wait for `#prices` to populate (poll `querySelectorAll('*')` for `$NNN` text).
3. Read `document.querySelectorAll('#prices')[1].textContent`.
4. Match `(?:^|Visit site)([^$]*?)\$([\d,]+)\s*\$([\d,]+)\s*\$([\d,]+)/g` — the third capture group is the stay total.
5. Look up provider in the `preceding` text against `KNOWN_SOURCES`; default to "Hotel direct".
6. Filter implausible totals (`< nights × $40`).
7. Take 3 cheapest unique totals per hotel.

Throws ~20-65 valid rows per hotel, takes ~25s per hotel including page load.

### Stable selectors (current code)
| Purpose | Selector |
|---|---|
| Hotel card link | `main c-wiz span c-wiz > c-wiz` then `.querySelector('a[href*="/travel/"]')` |
| Price-display dropdown trigger | `section span > span > span > button` (filter: `/night\|total\|stay/i`) |
| Stay-total option label | `label` filtered by `^Stay total/i` |
| Done button | `body > div > div > div > div > div > button` filter `^Done$` |
| Price option scrape (fallback chain) | `#prices section c-wiz`, then `#prices section`, then `#prices` |