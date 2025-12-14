# How to use the BrailleMonitor component

The BrailleMonitor component renders a visual, clickable representation of a braille display and thumb keys. It is reusable and self-rendering.

## 1. Required files

/components/braille-monitor/
  braillemonitor.js
  braillemonitor.css

(Optional demo file)
  example.html

## 2. Basic usage

HTML (page provides only an empty container)

  <div id=“brailleMonitorComponent”></div>

  <link rel=“stylesheet” href=“braillemonitor.css”>
  <script src=“braillemonitor.js”></script>

JavaScript

  const monitor = BrailleMonitor.init({
    containerId: “brailleMonitorComponent”
  });

  monitor.setText(“dit is een voorbeeld”);

This:
- creates the monitor UI
- renders braille cells
- shows thumbkey simulator buttons

## 3. Cursor routing (cell clicks)

  const monitor = BrailleMonitor.init({
    containerId: “brailleMonitorComponent”,

    onCursorClick(info) {
      // info = { index, letter, word }
      console.log(info);
    }
  });

Typical use:
- simulate cursor routing
- select a letter or word
- validate answers in learning activities

## 4. Thumb key mapping

  const monitor = BrailleMonitor.init({
    containerId: “brailleMonitorComponent”,

    mapping: {
      leftthumb:        () => console.log(“Left thumb”),
      middleleftthumb:  () => console.log(“Middle-left thumb”),
      middlerightthumb: () => console.log(“Middle-right thumb”),
      rightthumb:       () => console.log(“Right thumb”)
    }
  });

Works for:
- mouse clicks on the simulator buttons
- real thumb key events from BrailleBridge (if connected)

## 5. Updating the displayed text

Whenever text is sent to the real braille display, also update the monitor:

  await BrailleUI.setText(text);   // real device
  monitor.setText(text);          // visual monitor

Clear the monitor:

  monitor.clear();

## 6. Show or hide the info text

  const monitor = BrailleMonitor.init({
    containerId: “brailleMonitorComponent”,
    showInfo: false
  });

## 7. Using with EventLog (optional)

  const log = new EventLog(document.getElementById(“log”));

  const monitor = BrailleMonitor.init({
    containerId: “brailleMonitorComponent”,
    logger: log
  });

Logged events:
- key      -> thumb key presses
- routing  -> cursor routing clicks
- system  -> text updates

## 8. Component rules

- One container -> one BrailleMonitor
- Component renders its own HTML
- Page owns logic, timing, and game flow
- Keep braille device output and monitor output in sync

## 9. Common mistakes

- Writing component HTML manually
- Forgetting to include braillemonitor.css
- Initialising the component twice on the same container
- Updating the braille device without calling monitor.setText()

## 10. Summary

- Drop in an empty container
- Load the component CSS and JS
- Initialise with BrailleMonitor.init(...)
- Use setText() to keep the monitor in sync