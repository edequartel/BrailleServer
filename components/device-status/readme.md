How to use DeviceStatus (same-folder setup)

1. Put these three files in the same folder:
   - device-status-demo.html
   - device-status.js
   - device-status.css

2. Add a container to your HTML:
   <div id=“deviceStatus”></div>

3. Load the CSS and JS (same folder):
   <link rel=“stylesheet” href=“./device-status.css”>
   <script src=“./device-status.js”></script>

4. Create the component:
   const ds = new DeviceStatus({
     containerId: “deviceStatus”,
     label: “Braille display”,
     initialState: “connecting”,
     initialText: “Connecting...”
   });

5. Update the state:
   ds.setState(“connected”, “Focus 40 (USB)”);
   ds.setState(“disconnected”, “No device”);
   ds.setState(“error”, “Driver error”);

6. Optional: bind to BrailleBridge if available:
   if (window.BrailleBridge) {
     ds.bindToBrailleBridge(window.BrailleBridge);
   }