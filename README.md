# Pass The Dutchie

Website van Pass The Dutchie (Boardwalk 137, Sint Maarten): het menu, de
weekagenda, openingstijden, bezorging en contact. Bezoekers zien een moderne,
mobielvriendelijke site; de beheerder past alles aan via `beheer.html`.

Geen server, geen build-stap, geen dependencies: statische bestanden op GitHub
Pages, en de gegevens staan als één JSON-bestand in een **Gist** (de "database").

## Hoe het werkt

| | |
|---|---|
| Hosting | GitHub Pages (deze repo, gewoon vanuit de branch) |
| Gegevens | `menu.json` in een openbare Gist |
| Lezen (bezoekers) | Zonder sleutel, rechtstreeks van de GitHub-API |
| Schrijven (beheer) | Met een GitHub-sleutel die alleen Gists mag |
| Posters | in een tweede Gist, die het beheer bij de eerste upload zelf aanmaakt |
| Terugval | `data/menu.json` in de repo, plus een cache in de browser |

De GitHub-API staat zonder sleutel 60 verzoeken per uur per IP-adres toe. Zitten
veel gasten op dezelfde Wi-Fi, dan kan dat op raken; de site valt dan terug op de
CDN-kopie van de Gist (`gist.githubusercontent.com`), die geen limiet heeft maar
een paar minuten achter kan lopen. Daarvoor is `gistOwner` in `config.js` nodig.

Bezoekers krijgen meteen een menu te zien (uit de cache of uit `data/menu.json`)
en daarna, zodra de Gist binnen is, de actuele versie. Is GitHub even niet
bereikbaar, dan blijft de site gewoon werken.

## Eenmalig instellen

1. **Maak een sleutel.** Ga naar
   [GitHub → fine-grained token](https://github.com/settings/personal-access-tokens/new)
   en zet bij **Account permissions → Gists** de waarde op **Read and write**.
   Verder niets aanzetten.
2. **Open `beheer.html`** op de site, plak de sleutel en klik op *Inloggen*.
3. Klik op **Nieuwe Gist aanmaken**. De Gist wordt gevuld met het huidige menu.
4. **Zet het Gist-id en je GitHub-naam in `assets/js/config.js`** (het tabblad
   *Instellingen* laat de exacte regels zien) en push. Vanaf dan zien álle bezoekers het live menu.
   Tot die tijd ziet alleen jouw apparaat de Gist en de rest `data/menu.json`.

Eerst rondkijken kan ook: *Demo zonder sleutel* op de inlogpagina. Wijzigingen
blijven dan in je browser, en de website laat ze (alleen in die browser) zien met
een gele balk erboven.

## Beheren

- **Menu** — menu's (Food, Drinks, …), categorieën en items toevoegen, bewerken,
  verplaatsen en verwijderen. Per item: prijs, omschrijving, *uitverkocht*,
  *populair* en *verbergen*. Een categorie kan één prijs voor alles hebben
  (bijv. cocktails $14).
  - **Extra's** met meerprijs (*+ Cheese $3*) en **keuzes** zonder meerprijs
    (*Choose 1 side: Fries · Rice*), per gerecht of voor een hele categorie.
    Op de site altijd zichtbaar; een extra kan ook uitverkocht zijn. Bij de
    eerste keer openen van het beheer worden de oude omwegen ("Extra cheese" als
    gerecht, "add fries +$3" in de toelichting) eenmalig omgezet; dat staat dan
    als concept klaar tot je publiceert.
- **Events** — twee soorten:
  - *Events met een datum* (bijv. een Halloween-feest), met tijd, omschrijving en
    eventueel een **poster**. Met *Voorpagina* aan staat het event bovenaan de
    site onder "Coming up", zodat je het direct ziet na het scannen van de QR-code.
    Voorbije events verdwijnen vanzelf van de site.
  - *Vaste weekavonden* (karaoke op dinsdag enz.). Op de dag zelf staat er "Tonight" bij.

  Op de site staan beide onder het tabblad **Events**, naast Food en Drinks.
- **Info** — slogan, introductie, een tijdelijke mededeling, adres, telefoon,
  WhatsApp (wordt de *Order*-knop), socials, openingstijden, bezorgkosten en Wi-Fi.
- **Instellingen** — Gist-gegevens, back-up downloaden/terugzetten, terug naar het
  standaardmenu, en een beheerlink om in één tik op je telefoon in te loggen.

Wijzigingen staan eerst als concept klaar (ook na herladen). Pas met
**Publiceren** komen ze op de website. Heeft iemand anders intussen op een ander
apparaat gepubliceerd, dan vraagt de app eerst of je dat wilt overschrijven.

### Over de sleutel

De sleutel blijft in de browser van de beheerder (localStorage) en gaat alleen
naar `api.github.com`. Wie de sleutel heeft, kan bij de Gists van dat account —
gebruik dus een sleutel die alléén Gists mag. Lekt hij uit: intrekken bij GitHub,
nieuwe maken, opnieuw inloggen. De Gist blijft gewoon bestaan.

## Bestanden

```
index.html              de website
beheer.html             het beheer
data/menu.json          standaardmenu en terugval
assets/js/config.js     het Gist-id
assets/js/gist.js       de enige plek die met de GitHub-API praat
assets/js/store.js      laden, cache, demo en het datamodel (normalize)
assets/js/site.js       de website opbouwen
assets/js/admin.js      het beheer
assets/js/posters.js    posters verkleinen, uploaden en laden
assets/js/dom.js        kleine DOM-hulpjes (alles via textContent)
assets/css/             base.css (gedeeld), site.css, admin.css
qr/                     QR-codes naar de site (los, SVG, en een printkaart)
docs/handleiding.pdf     handleiding voor het beheer (ook online: …/passthedutchie/docs/handleiding.pdf)
```

Lokaal bekijken: `python3 -m http.server` in de repo en open
`http://localhost:8000`.

## Posters

Een poster wordt in de browser verkleind (max. 1400 px, JPEG, meestal 100–400 kB)
en als tekstbestand (`poster-….txt`, een data-URL) in een aparte Gist gezet. Zo
blijft het menubestand klein en snel. Bezoekers laden posters via de CDN van
GitHub. Haal je een poster weg of verwijder je een event, dan wordt het bestand
bij het publiceren ook uit de poster-Gist gehaald.
