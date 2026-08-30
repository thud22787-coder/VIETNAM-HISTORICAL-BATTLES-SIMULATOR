# HISTORICAL SOURCES

Source register for all historical claims used in scenarios.
Governed by [HISTORICAL_ACCURACY_CONTRACT.md](HISTORICAL_ACCURACY_CONTRACT.md).

**Rule (Master Prompt §5):** LLM knowledge, Wikipedia snippets, forums, game wikis and
AI-generated text are NOT sources of truth. They may point us at sources; they are never cited
as the source themselves. Every claim below records what class of evidence supports it.

## Source classes

| Class | Meaning | Example |
|-------|---------|---------|
| `ARCHAEOLOGICAL` | Physical excavated evidence, peer-reviewed | Bach Dang stake yards |
| `SCIENTIFIC` | Peer-reviewed measurement of the physical world | Tidal range studies |
| `PRIMARY_CHRONICLE` | Near-contemporary written chronicle (with its own biases) | Dai Viet su ky toan thu |
| `ACADEMIC_SECONDARY` | Scholarly monograph / journal article | Taylor, *The Birth of Vietnam* |
| `TERTIARY_UNVERIFIED` | Encyclopedia/aggregator, no attribution shown | Wikipedia infobox numbers |
| `UNSOURCED` | Figure circulates widely with no traceable origin | see S-005 |

`TERTIARY_UNVERIFIED` and `UNSOURCED` MUST NOT be presented in-game as historical fact.

---

## S-001 — Bach Dang stake yards: physical evidence

- **Class:** `ARCHAEOLOGICAL`
- **Confidence:** HIGH (for existence, construction and dating of the stakes)
- **Claim:** Three major stake yards are documented in the Bach Dang estuary: Yen Giang,
  Dong Van Muoi (DVM), and Dong Ma Ngua (DMN). Yen Giang stakes were first excavated in 1959.
  DMN was found in 2008 by a resident digging a fishpond; 55 stakes were recorded there,
  diameters c. 6-22 cm, densely arranged in strips "like a wall". Other recorded stakes are
  largely ironwood, c. 2.6-2.8 m long and 20-30 cm in diameter.
- **Dating:** Timber from ten DMN stakes (2009, 2010 excavations) analysed by the Forestry and
  Forest Products Research Institute (Japan) and Vietnam Forestry University; four samples
  radiocarbon dated at the University of Waikato Radiocarbon Dating Laboratory. Results cluster
  around c. 700 BP, consistent with the **1288** battle.
- **Researchers:** Dr Le Thi Lien (Institute of Archaeology, Vietnam); international team
  (Vietnam / USA / Australia), surveys and excavations from 2008.
- **Sources:**
  - Vietnam Maritime Archaeology Project (MUA), Bach Dang Project.
    http://www.themua.org/vietnam/bdp.php — *NOTE: server presents a self-signed TLS
    certificate; could not be fetched during research. Content below is from the paper title
    and secondary reporting of it. NEEDS DIRECT VERIFICATION.*
  - "Understanding the Bach Dang Battlefield from recent research results" (paper PDF hosted by
    MUA; also listed on academia.edu). **Not yet read in full — academia.edu returned HTTP 403.**

> **CRITICAL FOR SCENARIO DESIGN:** The excavated, radiocarbon-dated stake fields belong to the
> **1288** battle (Tran Hung Dao vs. the Yuan/Mongol fleet), **not** to Ngo Quyen's 938 battle.
> No comparable dated physical evidence for the 938 stakes was located during this research.
> Any 938 scenario asserting stake positions is therefore a `GAMEPLAY_ASSUMPTION`, not a fact.
> See ADR-007 for how this determined the choice of first vertical slice.

## S-002 — Bach Dang estuary tidal regime

- **Class:** `SCIENTIFIC`
- **Confidence:** HIGH (modern measurement) / MEDIUM (as a proxy for 13th-century conditions)
- **Claim:** The Bach Dang estuary (Quang Ninh / Hai Phong) has a **diurnal** tidal regime
  (one high and one low water per day). Tidal range is c. **2.5-3.2 m at spring tide** and
  c. **0.5-1.0 m at neap tide**.
- **Why it matters:** This is the physical mechanism the entire battle depends on, and unlike the
  troop numbers it is *measurable*. A diurnal regime means one usable tidal cycle per day, which
  constrains the timing window far more tightly than a semidiurnal regime would.
- **Caveat (`UNCERTAIN`):** These are **modern** measurements. The estuary has undergone c. 700
  years of sedimentation and channel migration; the paleo-channel differed from the modern one.
  Treat the *regime and order of magnitude* as reliable, absolute depths at a given point as not.
- **Sources:**
  - Vietnam Journal of Marine Science and Technology — suspended sediment transport in Bach Dang
    estuary. https://vjs.ac.vn/jmst/article/view/3526
  - VNU Journal of Science: Earth and Environmental Sciences — sediment transport and morphology
    change at the Bach Dang estuary. https://js.vnu.edu.vn/EES/article/view/1779
  - Aggregation dynamics along a salinity gradient in the Bach Dang estuary, North Vietnam.

## S-003 — Battle of Bach Dang 938: outline

- **Class:** `ACADEMIC_SECONDARY` / `PRIMARY_CHRONICLE`
- **Confidence:** HIGH (that the battle happened, and its outcome) / MEDIUM (tactical detail)
- **Claim:** In late 938 a Southern Han fleet under Liu Hongcao, sent by Liu Yan, entered the
  Bach Dang estuary and was defeated by Ngo Quyen. Liu Hongcao was killed. The victory ended the
  long period of northern domination. Vietnamese commanders named alongside Ngo Quyen include
  Duong Tam Kha, Kieu Cong Han, Do Canh Thac.
- **Sources:** Taylor, Keith Weller, *The Birth of Vietnam*, University of California Press, 1983
  (standard academic treatment; **cited here from catalogue records and secondary description —
  the book itself has NOT been consulted directly**). Dai Viet su ky toan thu is the chronicle
  underlying most accounts (**not consulted directly**).

## S-004 — Bach Dang 938: tactical sequence

- **Class:** `PRIMARY_CHRONICLE` transmitted via `TERTIARY_UNVERIFIED`
- **Confidence:** MEDIUM
- **Claim:** Iron-tipped stakes were planted in the riverbed, submerged at high tide. Light
  shallow-draft Vietnamese craft harassed the Southern Han fleet and drew it upstream. As the
  tide fell, the heavier ships were impaled/immobilised and then attacked.
- **Caveat:** This narrative is consistent across accounts but reaches us through late chronicle
  tradition and modern retellings. The *tide + stakes + feigned withdrawal* structure is well
  attested; precise choreography is not recoverable at the level a simulation needs.

## S-005 — Troop numbers: DISPUTED / UNSOURCED

- **Class:** `UNSOURCED` — **DO NOT PRESENT AS FACT**
- **Confidence:** LOW
- **Conflict record:**

| Claim | Figure | Attribution found |
|---|---|---|
| Southern Han strength (938) | 20,000 | Wikipedia infobox, attributed to `baodanang.vn` (a newspaper/tourism site) |
| Tinh Hai quan strength (938) | 5,000-10,000 | Wikipedia infobox, **no source attribution whatsoever** |
| Southern Han casualties (938) | 10,000 ("mot van quan") | Vietnamese-language secondary source |
| Southern Han losses | "more than half" drowned incl. Liu Hongcao | secondary retellings of chronicle |
| Ship complement | 50 men/ship: 20 sailors, 25 warriors, 2 crossbowmen | secondary; internally inconsistent (sums to 47, not 50) |

- **Current interpretation:** None of these figures is usable as a `VERIFIED_FACT`. The ship
  complement figure is *demonstrably* corrupted — the stated roles sum to 47 against a stated
  total of 50 — which is a good illustration of why the whole class is untrustworthy.
  Pre-modern chronicle army sizes are, as a general matter of historiography, unreliable and
  frequently inflated.
- **Action:** Any force size the simulation needs is modelled as a `RANGE` with explicit
  `confidence`, or declared a `SIMULATION_PARAMETER` (Master Prompt §87). Never rendered as
  "the historical army numbered N".

---

## Research debts (open)

These MUST be closed before any scenario claims `VERIFIED_FACT` status for the affected data.

- **RD-01** Read the MUA archaeology paper in full (TLS/403 blocked both routes). Needed for:
  exact stake counts per yard, driving angle, paleo-channel reconstruction, full C14 ranges.
- **RD-02** Consult Taylor, *The Birth of Vietnam*, directly rather than via description.
- **RD-03** Consult a translation of Dai Viet su ky toan thu / An Nam chi luoc for the 938 and
  1288 passages, and record what the chronicles actually say vs. what modern retellings add.
- **RD-04** Find peer-reviewed paleo-tidal or paleo-geographic reconstruction of the 13th-century
  estuary, to replace the modern-tide proxy in S-002.
