{
  "meta": {
    "id": "marechal",
    "title": "Met Punt Op Pad – Woordenset 1",
    "caption": "Braille-oefenwoorden met activiteiten (verhaal, leesregels, letters, woorden, geluiden) voor BrailleServer.",
    "description": "Deze JSON bevat korte woordlessen (bal, kam, aap, tak) met bijbehorende letters, oefenwoorden, voorbeeldzinnen, audio-bestanden en activiteit-definities. Bedoeld voor auditief-tactiele koppeling en spelend leren met een brailleleesregel via BrailleServer.",
    "fileType": "content/words",
    "language": "nl",
    "domain": "braille-literacy",
    "targetAudience": {
      "ageRange": "6–10",
      "educationContext": "onderwijs voor leerlingen met een visuele beperking",
      "levels": ["SO", "VSO", "VMBO-B"]
    },
    "didactics": [
      "leren door spel",
      "auditief-tactiele koppeling",
      "herhaling en variatie",
      "actief voelen en handelen"
    ],
    "author": {
      "name": "Eric de Quartel",
      "role": "concept, didactiek, structuur",
      "organization": "Bartiméus Onderwijs"
    },
    "contributors": [
      {
        "role": "ontwikkeling",
        "note": "BrailleServer / BrailleBridge integratie en activity runner"
      },
      {
        "role": "audio",
        "note": "Instructies, verhalen en effectgeluiden (mp3)"
      }
    ],
    "created": "2025-01-01",
    "lastModified": "2026-01-03",
    "version": "1.0.0",
    "compatibleWith": {
      "app": "BrailleServer",
      "minVersion": "0.9.0"
    },
    "license": "educational-use-only",
    "source": "Met Punt Op Pad (MPOP++)",
    "notes": [
      "Alle mp3-bestanden worden relatief gerefereerd (bijv. bal.mp3).",
      "Activities.id moet overeenkomen met window.Activities[canonicalActivityId(id)].",
      "Pairletters ondersteunt twoletters/targetCount/nrof/lineLen zoals in runner/activities."
    ]
  },
  "items": [
    {
      "id": "bal-001",
      "word": "bal",
      "knownLetters": [],
      "letters": ["b", "a", "l"],
      "words": ["bal", "ba", "al", "la"],
      "text": [
        ["bal", "bal BAL bal", "bal bal bal"],
        ["Kijk, een bal!", "De bal gaat heen en weer.", "De bal komt terug."]
      ],
      "story": ["bal.mp3"],
      "sounds": ["bounce.mp3", "shot.mp3", "goal.mp3"],
      "activities": [
        {
          "id": "story",
          "index": 0,
          "caption": "Verhaal",
          "instruction": "bal-story-instruction.mp3",
          "text": "[luister] De computer leest een verhaal. [stil] Luister goed."
        },
        {
          "id": "readlines",
          "index": 0,
          "caption": "Lees regels",
          "instruction": "bal-readlines-instruction.mp3",
          "text": "[lees] Lees de regels op de leesregel. [klik] Druk op volgende."
        },
        {
          "id": "pairletters",
          "caption": "Zoek 2 paren",
          "instruction": "bal-pairletters-instruction.mp3",
          "text": "[spel] Zoek twee keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": true,
          "targetCount": 2,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "pairletters",
          "caption": "Zoek 2 paren",
          "instruction": "bal-pairletters-instruction.mp3",
          "text": "[spel] Zoek twee keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": false,
          "targetCount": 2,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "pairletters",
          "caption": "Zoek 3 paren",
          "instruction": "bal-pairletters-instruction.mp3",
          "text": "[spel] Zoek drie keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": true,
          "targetCount": 3,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "pairletters",
          "caption": "Zoek 4 paren",
          "instruction": "bal-pairletters-instruction.mp3",
          "text": "[spel] Zoek vier keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": false,
          "targetCount": 4,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "letters",
          "caption": "Voel letters",
          "instruction": "bal-letters-instruction.mp3",
          "text": "[voel] Voel een letter. [typ] Type die letter. [ga door] Ga verder."
        },
        {
          "id": "sounds",
          "caption": "Geluid",
          "instruction": "bal-sounds-instruction.mp3",
          "text": "[luister] Hoor je een geluid? [denk] Past dit bij bal?"
        }
      ],
      "short": true,
      "icon": "ball.icon",
      "emoji": "⚽"
    },
    {
      "id": "kam-001",
      "word": "kam",
      "knownLetters": ["b", "a", "l"],
      "letters": ["k", "a", "m"],
      "words": ["kam", "ka", "am", "mak"],
      "text": [
        ["Dit is een kam.", "uIk kam mijn haar.", "De kam gaat van boven naar beneden."],
        ["Hier ligt een kam.", "Je gebruikt een kam voor je haar.", "De kam heeft tanden."]
      ],
      "story": ["kam.mp3"],
      "sounds": ["scratch.mp3", "hair.mp3", "tap.mp3"],
      "activities": [
        {
          "id": "story",
          "index": 0,
          "caption": "Verhaal",
          "instruction": "kam-story-instruction.mp3",
          "text": "[luister] De computer leest een verhaal. [stil] Luister goed."
        },
        {
          "id": "pairletters",
          "caption": "Zoek 4 paren",
          "instruction": "kam-pairletters-instruction.mp3",
          "text": "[spel] Zoek vier keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": true,
          "targetCount": 4,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "tts",
          "caption": "Luister woord",
          "instruction": "kam-tts-instruction.mp3",
          "text": "[luister] Hoor het woord. [lees] Lees het op de leesregel."
        },
        {
          "id": "letters",
          "caption": "Voel letters",
          "instruction": "kam-letters-instruction.mp3",
          "text": "[voel] Voel een letter. [typ] Type wat je voelt. [ga door] Ga verder."
        },
        {
          "id": "words",
          "caption": "Maak woord",
          "instruction": "kam-words-instruction.mp3",
          "text": "[bouw] Maak een woord met kam. [volgende] Kies het volgende woord."
        },
        {
          "id": "story",
          "index": 0,
          "caption": "Verhaal nog eens",
          "instruction": "kam-story2-instruction.mp3",
          "text": "[luister] Luister nog een keer. [let op] Hoor de klanken."
        },
        {
          "id": "sounds",
          "caption": "Geluid",
          "instruction": "kam-sounds-instruction.mp3",
          "text": "[luister] Welk geluid hoort bij kam?"
        }
      ],
      "short": true,
      "icon": "comb.icon",
      "emoji": "💇"
    },
    {
      "id": "aap-001",
      "word": "aap",
      "knownLetters": ["b", "a", "l", "k", "m"],
      "letters": ["a", "a", "p"],
      "words": ["aap", "aa", "ap", "pa"],
      "text": [
        ["Dit is een aap.", "De aap springt.", "De aap maakt geluid."],
        ["Kijk, een aap.", "De aap klimt omhoog.", "De aap zit in een boom."]
      ],
      "story": ["aap1.mp3", "aap2.mp3"],
      "sounds": ["monkey1.mp3", "monkey2.mp3", "jump.mp3"],
      "activities": [
        {
          "id": "tts",
          "caption": "Luister woord",
          "instruction": "aap-tts-instruction.mp3",
          "text": "[luister] Hoor het woord. [zeg] Zeg het hardop. [lees] Lees het daarna."
        },
        {
          "id": "pairletters",
          "caption": "Zoek 2 paren",
          "instruction": "aap-pairletters-instruction.mp3",
          "text": "[spel] Zoek twee keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": true,
          "targetCount": 2,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "letters",
          "caption": "Voel letters",
          "instruction": "aap-letters-instruction.mp3",
          "text": "[voel] Voel de letters. [let op] De a is er twee keer."
        },
        {
          "id": "words",
          "caption": "Maak woord",
          "instruction": "aap-words-instruction.mp3",
          "text": "[bouw] Maak woorden met a, a en p. [volgende] Kies het volgende woord."
        },
        {
          "id": "story",
          "index": 1,
          "caption": "Verhaal",
          "instruction": "aap-story-instruction.mp3",
          "text": "[luister] Luister naar het verhaal. [alert] Hoor je aap?"
        },
        {
          "id": "sounds",
          "caption": "Geluid",
          "instruction": "aap-sounds-instruction.mp3",
          "text": "[luister] Welk geluid hoort bij de aap?"
        }
      ],
      "short": true,
      "icon": "monkey.icon",
      "emoji": "🐒"
    },
    {
      "id": "tak-001",
      "word": "tak",
      "knownLetters": ["b", "a", "l", "k", "m", "p"],
      "letters": ["t", "a", "k"],
      "words": ["tak", "ta", "ak", "kat"],
      "text": [
        ["Dit is een tak.", "De tak ligt op de grond.", "De tak kraakt."],
        ["Hier is een tak.", "De tak waait heen en weer.", "De tak breekt soms."]
      ],
      "story": ["tak1.mp3", "tak2.mp3"],
      "sounds": ["branch.mp3", "snap.mp3", "wind.mp3"],
      "activities": [
        {
          "id": "tts",
          "caption": "Luister woord",
          "instruction": "tak-tts-instruction.mp3",
          "text": "[luister] Hoor het woord. [lees] Lees het op de leesregel."
        },
        {
          "id": "pairletters",
          "caption": "Zoek 2 paren",
          "instruction": "tak-pairletters-instruction.mp3",
          "text": "[spel] Zoek twee keer dezelfde letters. [voel] Voel de letters. [druk] Zijn ze hetzelfde? Druk de cursor in. [door] Zoek ze allemaal.",
          "twoletters": true,
          "targetCount": 2,
          "nrof": 4,
          "lineLen": 10
        },
        {
          "id": "letters",
          "caption": "Voel letters",
          "instruction": "tak-letters-instruction.mp3",
          "text": "[voel] Voel een letter. [typ] Type die letter. [ga door] Ga verder."
        },
        {
          "id": "words",
          "caption": "Maak woord",
          "instruction": "tak-words-instruction.mp3",
          "text": "[bouw] Maak woorden met t, a en k. [tip] Probeer ook: kat."
        },
        {
          "id": "story",
          "index": 1,
          "caption": "Verhaal",
          "instruction": "tak-story-instruction.mp3",
          "text": "[luister] Luister naar het verhaal. [let op] Hoor je t of k?"
        },
        {
          "id": "sounds",
          "caption": "Geluid",
          "instruction": "tak-sounds-instruction.mp3",
          "text": "[luister] Welk geluid past bij een tak?"
        }
      ],
      "short": true,
      "icon": "branch.icon",
      "emoji": "🌿"
    }
  ]
}