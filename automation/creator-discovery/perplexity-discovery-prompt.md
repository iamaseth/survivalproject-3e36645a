# Perplexity Raw Creator Discovery Prompt

Copy this prompt into Perplexity web. Run it repeatedly with different topic groups until the combined raw pool reaches about 6,000 unique platform profiles.

```text
I am building a large raw discovery list of potential creators for Survival Tabs, an emergency preparedness and emergency nutrition brand.

YOUR ONLY JOB IS DISCOVERY.

Find as many REAL creator profiles as possible on BOTH:
- YouTube
- TikTok

Do not qualify them yet. We will verify audience size and activity later with platform-specific tools/APIs.

IMPORTANT:
- Do NOT judge whether they are ultimately qualified.
- Do NOT research email addresses.
- Do NOT research contact information.
- Do NOT filter by subscriber/follower count.
- Do NOT invent creator names, handles, or URLs.
- Every result must be a real creator/profile that you can verify exists.
- Direct YouTube channel URLs or TikTok profile URLs are strongly preferred.
- Do not return individual video URLs when the creator/profile URL can be identified.
- Dedupe results within this run.
- Individual creators, couples, families and small creator-led businesses are acceptable at this discovery stage.
- Exclude obvious government departments, major news organizations, and generic article pages when they are clearly not creator accounts.
- Accuracy is more important than filling the table.

SEARCH BROADLY ACROSS THESE AUDIENCES:
Emergency preparedness
Preppers
Survival
Food storage
Prepper pantry
Emergency food
Long-term food storage
72-hour kits
Bug-out bags
Go bags
Emergency supplies
Emergency nutrition
Homesteading
Self-sufficiency
Self-reliance
Off-grid living
Off-grid families
Camping
Bushcraft
Hiking
Backpacking
Outdoor families
Overlanding
RV living
Van life
EDC
Outdoor gear reviews
Survival gear reviews
Camping gear reviews
Emergency radios
Solar generators
Backup power
Water filtration
Emergency water
First aid
Power outages
Hurricanes
Earthquakes
Wildfires
Winter storms
Tornado preparedness
Urban preparedness
Apartment preparedness
Family preparedness
Women preppers
Prepper moms
Senior preparedness
Faith-based preparedness
Veterans interested in preparedness
Military-family preparedness
Hunting
Fishing
Emergency cooking
Camping meals
Backpacking food
Freeze-dried food
Emergency vehicle kits
Supply-chain preparedness

Also use adjacent terminology and hashtags that could uncover creators we would otherwise miss.

TARGET:
Our combined master list will eventually contain approximately 6,000 unique raw YouTube/TikTok creator profiles.

FOR THIS RUN:
Return the maximum number of unique real profiles you can reliably find.

OUTPUT ONLY A TABLE WITH THESE COLUMNS:
Creator Name | Platform | Direct Profile URL | Handle (if visible) | Primary Topic | Search Theme

Do not write an introduction.
Do not summarize the results.
Do not recommend creators.
Do not provide emails.
Do not stop after a handful of examples.

At the very end write only:
TOTAL UNIQUE PROFILES: [number]
```

## Batch strategy
Do not ask Perplexity for all 6,000 at once. Run focused batches across different topic groups and merge them into the raw workbook. Examples: preparedness/food storage; homesteading/off-grid; camping/backpacking; gear/EDC; family/urban; disasters/power/water; hunting/fishing/outdoor families; RV/van/overlanding.
