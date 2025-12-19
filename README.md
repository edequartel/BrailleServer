# BrailleServer

18dec25 - new branch developer
18dec25 - ftech alleen only
18dec25 - merged into main
19dec25 - changed into elevenlabs, main is behind of developer.

test

words is now the truth. has not be tested yet with brailledisplay.

ideas for activities
the ones already in braillestudio
one which tracks your reading speed.
a tracking system which saves tracking local and is private.
dictee. comprehension. asking questions after de text is read.

BrailleServer is de online omgeving voor **BrailleStudio**.  
Het is een volledig statische webomgeving (HTML, CSS, JavaScript) die communiceert met **BrailleBridge** — een lokale Windows-applicatie die de brailleleesregel aanstuurt via SAM32.dll, USB-communicatie en websockets.

Deze handleiding beschrijft:

1. Architectuur en afhankelijkheden  
2. Projectstructuur  
3. JavaScript-frameworks (BrailleBridge, BrailleUI, Sounds, Logging)  
4. Lokaal draaien & hosting  
5. Nieuwe spellen/pagina’s bouwen  
6. Debugging & troubleshooting  

---

## 1. Architectuur

### 1.1 Overzicht

BrailleServer bestaat uit:

- **Statische website**  
  - HTML-pagina’s in `/` en `/pages`
  - CSS in `/css`
  - JavaScript-frameworks in `/js`

- **BrailleBridge (extern, lokaal op Windows)**  
  - HTTP-server: `http://localhost:5000`  
  - WebSocket-server: `ws://localhost:5000/ws`  
  - Stuurt tekst naar de leesregel en ontvangt key events:
    - Cursor routing
    - Thumbkeys
    - Functietoetsen afhankelijk van het device

- **Audiobestanden via Howler.js**  
  - Geconfigureerd in `config/sounds.json`  
  - Ondersteunt letters, woorden, UI-geluiden en verhalen.

### 1.2 Datastromen

**Browser → BrailleBridge → Leesregel**

- `BrailleBridge.sendText("Hallo")` stuurt tekst naar `/braille`
- `BrailleBridge.clearDisplay()` roept `/clear` aan

**Leesregel → BrailleBridge → Browser**

- Gebruiker drukt op een cursor- of thumbkey  
- BrailleBridge stuurt een WebSocket-bericht zoals:
  ```json
  { "event": "cursor", "index": 3 }

	•	JS ontvangt en verwerkt events in spel-/UI-logica

Browser → Audio
	•	Sounds.playLetter("nl","a")
	•	Sounds.playWord("nl","bal")

⸻

2. Projectstructuur

BrailleServer/
│ index.html                   – Startpagina met alle demo’s en spellen
│
├── pages/                     – Individuele spellen/demopagina’s
│     brailleui-demo.html
│     game-words.html
│     ...
│
├── js/                        – Frameworks & spelscripts
│     braillebridge.js         – API-client naar BrailleBridge
│     brailleui.js             – UI-laag + braillemonitor
│     sounds.js                – Audio wrapper (Howler.js)
│     logging.js               – Logframework
│
├── css/
│     style.css                – Globale styles, monitor en logvenster
│
├── config/
│     sounds.json              – Audioconfiguratie
│
└── documents/                 – Documentatie & structuurinformatie


⸻

3. Frameworks

3.1 BrailleBridge (js/braillebridge.js)

Initialisatie

BrailleBridge.connect();

Configuratie

BrailleBridge.setConfig({
  baseUrl: "http://localhost:5000",
  wsUrl: "ws://localhost:5000/ws",
  displayCells: 40
});

Tekst naar de leesregel

await BrailleBridge.sendText("Hallo braille!", {
  pad: true,
  cells: 40
});

Leesregel leegmaken

await BrailleBridge.clearDisplay();

Events

BrailleBridge.on("connected", () => {});
BrailleBridge.on("disconnected", () => {});
BrailleBridge.on("cursor", evt => console.log(evt.index));
BrailleBridge.on("thumbkey", evt => console.log(evt.name));
BrailleBridge.on("message", evt => {});
BrailleBridge.on("error", evt => {});


⸻

3.2 BrailleUI (js/brailleui.js)

Een hogere UI-laag boven op BrailleBridge:
	•	interne modelbuffer van de brailleregel
	•	toont een visuele braillemonitor
	•	interpreteert cursor-events naar woorden/letters
	•	ondersteunt paginabeheer

Initialisatie

const ui = new BrailleUI({
  displayCells: 40,
  bridge: BrailleBridge,
  autoAttachCursor: true
});

Koppelen aan een monitor

HTML:

<div id="brailleMonitor" class="braille-monitor"></div>

JS:

ui.attachMonitor("brailleMonitor");

Tekst zetten

ui.setText("Hallo braille!");

Tokens (woorden) zetten

ui.setTokens(["bal", "is", "rond"]);

Paginamodus

ui.setPageText("Lange tekst\nmet meerdere regels");
ui.nextLine();
ui.prevLine();

Cursor-events

ui.on("cursorChar", evt => {
  console.log("Char:", evt.char);
});

ui.on("cursorWord", evt => {
  console.log("Word:", evt.word);
});


⸻

3.3 Sounds (js/sounds.js)

Dependencies

<script src="https://cdnjs.cloudflare.com/ajax/libs/howler/2.2.4/howler.min.js"></script>
<script src="../js/sounds.js"></script>

Initialisatie

await Sounds.init("config/sounds.json");

Afspelen

Sounds.playLetter("nl", "a");
Sounds.playWord("nl", "bal");
Sounds.playUI("nl", "correct");
Sounds.playStory("nl", "bal");
Sounds.playShared("applause");

Voorbeeld sounds.json

{
  "baseUrl": "https://www.tastenbraille.com/braillestudio",
  "defaultExtension": ".mp3",
  "languages": {
    "nl": {
      "lettersPath": "/sounds/nl/alfabet",
      "wordsPath": "/sounds/nl/words",
      "uiPath": "/sounds/nl/ui",
      "stories": "/sounds/nl/stories"
    }
  },
  "shared": {
    "basePath": "/sounds/shared"
  }
}


⸻

3.4 Logging (js/logging.js)

Logbox toevoegen

<div id="logBox" class="log-box"></div>

Logging configureren

Logging.setLevel("debug");
Logging.addSink(Logging.createDomSink("logBox"));
Logging.info("App", "Gestart");
Logging.error("Game", "Foutmelding");


⸻

4. De website lokaal draaien

4.1 Clone

git clone https://github.com/edequartel/BrailleServer
cd BrailleServer

4.2 Start een lokale server

Browsers blokkeren file:// → JSON requests, dus gebruik:

VS Code Live Server
of:

npx http-server .

Open:

http://localhost:8080/index.html

4.3 Start BrailleBridge

Zorg dat de BrailleBridge Windows-app draait vóór je een pagina opent.

⸻

5. Nieuwe pagina’s of spellen bouwen

5.1 Nieuwe HTML-pagina

Plaats in /pages/mygame.html:

<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Mijn spel</title>
  <link rel="stylesheet" href="../css/style.css">
  <script src="../js/logging.js"></script>
  <script src="../js/braillebridge.js"></script>
  <script src="../js/brailleui.js"></script>
  <script src="../js/sounds.js"></script>
  <script src="../js/mygame.js" defer></script>
</head>
<body>
  <h1>Mijn spel</h1>
  <div id="brailleMonitor" class="braille-monitor"></div>
  <div id="logBox" class="log-box"></div>
</body>
</html>

5.2 Eigen spelscript

/js/mygame.js:

(async function () {
  await Sounds.init("../config/sounds.json");
  BrailleBridge.connect();

  const ui = new BrailleUI({ bridge: BrailleBridge });
  ui.attachMonitor("brailleMonitor");

  ui.setText("Kies een letter");

  ui.on("cursorChar", evt => {
    Sounds.playLetter("nl", evt.char);
  });
})();


⸻

6. Troubleshooting

Display toont tekst niet
	•	Controleer BrailleBridge draait
	•	Controleer localhost:5000 bereikbaar
	•	In logbox:
	•	"disconnected" → service is niet beschikbaar
	•	"http error" → geen toegang tot /braille

Audio speelt niet af
	•	Controleer:
	•	sounds.json pad klopt
	•	BaseUrl werkt in de browser
	•	De bestandsnaam in de map bestaat
	•	Open console → eventuele 404’s zichtbaar

Cursor routing werkt niet
	•	Kijk in de logbox: wordt "cursor" gemeld?
	•	Als niets binnenkomt:
	•	BrailleBridge herstarten
	•	Driver/leesregel opnieuw verbinden
	•	USB los/vast

UI-monitor werkt niet
	•	ui.attachMonitor("brailleMonitor") gekoppeld?
	•	Element heeft class .braille-monitor?
	•	In console controleren of ui correct is geïnitialiseerd.

⸻

7. Hosting via GitHub Pages

In de instellingen van GitHub:
	1.	Ga naar Settings → Pages
	2.	Kies Source: main branch
	3.	Wacht 1–2 minuten
	4.	De site draait op:

https://<user>.github.io/BrailleServer/

Let op:
	•	De site werkt alleen volledig met een lokale BrailleBridge
	•	Audio moet via HTTPS geladen worden (werkt al)

⸻

8. Samenvatting

BrailleServer biedt:
	•	Een consistente UI-laag (BrailleUI)
	•	Een betrouwbare communicatieclient (BrailleBridge JS)
	•	Een flexibel audiosysteem (Sounds)
	•	Een loggingframework voor debug en onderwijs
	•	Een uitbreidbare structuur voor spellen en demo’s

Gebruik de frameworks om snel nieuwe braille-oefeningen, educatieve modules en demopagina’s te bouwen.


