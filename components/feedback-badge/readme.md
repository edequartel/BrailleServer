## How to use `FeedbackBadge` (short & simple)

### 1. HTML
```html
<div class=“feedback-badge feedback-badge—hidden”>
  <span class=“feedback-badge__icon”>✔</span>
  <span class=“feedback-badge__text”>Feedback</span>
</div>

2. Load the JavaScript

<script src=“feedback-badge.js”></script>

3. Use it in JavaScript

const badge = new FeedbackBadge(
  document.querySelector(“.feedback-badge”)
);

badge.showCorrect(“Goed gedaan”);   // green badge with ✔
badge.showWrong(“Probeer opnieuw”); // red badge with ✖
badge.hide();                       // hide badge

You only need these three steps.

