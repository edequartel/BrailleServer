FeedbackBadge – how to use

1. Add a container to your page:
<div id=“feedback”></div>

2. Load the component files:
<link rel=“stylesheet” href=“../components/feedback-badge/feedback-badge.css”>
<script src=“../components/feedback-badge/feedback-badge.js”></script>

3. Create the badge:
const badge = new FeedbackBadge({ containerId: “feedback” });

4. Show feedback:
badge.show(“correct”, “Correct!”);
badge.show(“wrong”, “Try again”);
badge.show(“info”, “Next word…”);

5. Auto-hide (milliseconds):
badge.show(“correct”, “Correct!”, 1200);

6. Clear manually:
badge.clear();

Notes:
- Types: correct | wrong | info
- Pure UI component (no BrailleBridge dependency)
- Use from game/page logic