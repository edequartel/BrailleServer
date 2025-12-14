# event-log component (short)

## What it is
Reusable logging panel for BrailleServer pages.
Shows timestamped events such as keys, routing, audio and system messages.

## Files

/components/event-log/

- event-log.js
- event-log.css
- event-log.template.html

## How to include


<link rel=“stylesheet” href=“../components/event-log/event-log.css”>
<script src=“../components/event-log/event-log.js”></script>

<div id=“log”></div>


## How to use

const log = new EventLog(document.getElementById(“log”));

log.log(“BrailleBridge connected”, “system”);
log.log(“Left thumb pressed”, “key”);
log.log(“Routing button 12”, “routing”);
log.log(“Playing letter-a.mp3”, “audio”);

## Clear log
log.clear();

## Log types

- system
- key
- routing
- audio

## Purpose

- Replace console.log
- Debug without hardware
- One consistent logger for all pages