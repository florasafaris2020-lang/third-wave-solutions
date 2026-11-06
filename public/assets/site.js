/* existing site.js continues, with a Worker route branch added */
var forms = document.querySelectorAll(
  'form[action*="formsubmit.co/"], form[action*="formsubmit.app/"], form[action*="/api/business-submit"]'
);
if (!forms.length) return;

Array.prototype.forEach.call(forms, function (form) {
  var status = form.querySelector("[id$='formStatus']") || document.getElementById("formStatus");
  var button = form.querySelector("button[type='submit']");
  var original = button ? button.innerHTML : "";
  var timer = null;

  var isWorkerSubmission = form.action.indexOf('/api/business-submit') !== -1;
  if (isWorkerSubmission) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      if (button) {
        button.disabled = true;
        button.innerHTML = 'Sending…';
      }
      if (status) {
        status.textContent = 'Sending your business details…';
        status.style.color = '#0a5f59';
        status.style.fontWeight = '600';
      }

      try {
        const response = await fetch(form.action, {
          method: 'POST',
          body: new FormData(form),
          headers: { 'Accept': 'application/json' },
        });
        const payload = await response.json().catch(function () {
          return {};
        });

        if (!response.ok) {
          throw new Error(payload.error || 'Submission failed');
        }

        form.reset();
        if (status) {
          status.textContent = payload.message || 'Your submission has been received for review.';
          status.style.color = '#0a5f59';
          status.style.fontWeight = '600';
        }
        const successBox = document.getElementById('formSuccess');
        if (successBox) {
          successBox.style.display = 'block';
        }
        if (payload.reviewUrl) {
          console.log('Review URL:', payload.reviewUrl);
        }
      } catch (error) {
        if (status) {
          status.textContent = error.message || 'Submission failed. Please try again.';
          status.style.color = '#a33';
          status.style.fontWeight = '600';
        }
      } finally {
        if (button) {
          button.disabled = false;
          button.innerHTML = original;
        }
      }
    });
    return;
  }

  form.target = frameName;

  function say(message, color) {
    if (!status) return;
    status.textContent = message;
    status.style.color = color;
    status.style.fontWeight = '600';
  }

  form.addEventListener('submit', function () {
    if (button) {
      button.disabled = true;
      button.innerHTML = 'Sending…';
    }
    say('Sending your message…', '#0a5f59');

    window.clearTimeout(timer);
    timer = window.setTimeout(function () {
      form.reset();
      if (button) {
        button.disabled = false;
        button.innerHTML = original;
      }
      say(
        'Thank you — your message has been sent. We usually reply within one working day. ' +
          'For anything urgent call or WhatsApp 0101 490 036.',
        '#0a5f59'
      );
    }, 1800);
  });
});
