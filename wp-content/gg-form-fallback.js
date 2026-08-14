/* ---------------------------------------------------------------------------
   CONTACT FORM FALLBACK  —  added 2026-08-14 during the outage recovery.

   THE PROBLEM THIS EXISTS FOR.
   Every enquiry form on this site was built with Contact Form 7 and Metform.
   Both are WordPress PHP plugins: the browser posts to admin-ajax.php and the
   server emails the business. The recovered site is STATIC — there is no PHP,
   so that endpoint does not exist.

   Left alone, a visitor fills in their name, phone and address, clicks Send,
   and NOTHING HAPPENS. No error, no email. They believe they have contacted
   the business. That is worse than having no form at all: a missing form sends
   them to the phone number, a broken form loses them silently. 31 pages carry
   one.

   WHAT THIS DOES.
   Intercepts the submit, collects whatever the visitor typed, and hands it to
   their own email app addressed to the business, with everything pre-filled.
   If their device has no mail app configured, it shows the phone number
   instead. No backend, no third-party service, no signup.

   THIS IS AN INTERIM. It is honest — the enquiry genuinely reaches the
   business — but it is clunky, because it opens the visitor's mail app. The
   proper fix is a real form endpoint on whichever host the site lands on.
   Delete this file the moment that exists.
--------------------------------------------------------------------------- */
(function () {
  'use strict';

  var TO    = 'moldandenvironmental@gmail.com';
  var PHONE = '(754) 703-8317';
  var TEL   = '+17547038317';

  // Field names the recovered forms actually use, mapped to plain labels.
  var LABELS = {
    fullname: 'Name', 'your-name': 'Name', 'cont-name': 'Name', name: 'Name',
    email: 'Email', 'your-email': 'Email', 'cont-email': 'Email',
    phone: 'Phone', tel: 'Phone', 'your-phone': 'Phone',
    address: 'Address', detail: 'Details', message: 'Message', 'your-message': 'Message'
  };

  // Machinery fields that must never reach the email body. Caught by testing this for real:
  // the first version put "G recaptcha response: <token>" into the message. In production that
  // token is a several-hundred-character blob, so every single enquiry would have arrived with a
  // wall of junk above the customer's actual details.
  var JUNK = /^(g-recaptcha-response|_wpcf7|_wpcf7_\w+|_wpnonce|_wp_http_referer|recaptcha\w*|captcha|honeypot|hp|website_url|url)$/i;

  function label(rawName) {
    if (!rawName) return null;
    // Elementor posts as form_fields[name]; unwrap to the inner key.
    var m = rawName.match(/^form_fields\[(.+)\]$/);
    var key = (m ? m[1] : rawName).toLowerCase();
    if (JUNK.test(key)) return null;
    if (LABELS[key]) return LABELS[key];
    if (/^field_/.test(key)) return null;      // generated ids carry no meaning
    if (key === 's') return null;
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/[-_]+/g, ' ');
  }

  function collect(form) {
    var out = [];
    var els = form.querySelectorAll('input, textarea, select');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var t = (el.type || '').toLowerCase();
      if (t === 'hidden' || t === 'submit' || t === 'button') continue;
      if ((t === 'checkbox' || t === 'radio') && !el.checked) continue;
      var v = (el.value || '').trim();
      if (!v) continue;
      var l = label(el.name || el.id);
      if (!l) continue;
      out.push(l + ': ' + v);
    }
    return out;
  }

  function notice(form, text) {
    var box = form.querySelector('.gg-form-notice');
    if (!box) {
      box = document.createElement('div');
      box.className = 'gg-form-notice';
      box.setAttribute('role', 'status');
      box.style.cssText = 'margin-top:14px;padding:12px 14px;border-radius:8px;' +
        'background:rgba(41,182,232,.12);border:1px solid rgba(41,182,232,.5);' +
        'font-size:15px;line-height:1.5;';
      form.appendChild(box);
    }
    box.innerHTML = text;
  }

  function handle(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    if (form.getAttribute('role') === 'search' || form.querySelector('input[name="s"]')) return;

    e.preventDefault();
    e.stopPropagation();

    var lines = collect(form);
    if (!lines.length) {
      notice(form, 'Please fill in your details first, or call us on ' +
        '<a href="tel:' + TEL + '"><strong>' + PHONE + '</strong></a>.');
      return;
    }

    var subject = 'Website enquiry — ' + (document.title || '').split('|')[0].trim();
    var body = lines.join('\n') + '\n\n---\nSent from ' + location.href;
    var href = 'mailto:' + TO + '?subject=' + encodeURIComponent(subject) +
               '&body=' + encodeURIComponent(body);

    notice(form,
      'Opening your email app so you can send this to us. ' +
      'If nothing opens, email <a href="mailto:' + TO + '"><strong>' + TO + '</strong></a> ' +
      'or call <a href="tel:' + TEL + '"><strong>' + PHONE + '</strong></a>.');

    window.location.href = href;
  }

  // Capture phase, so this runs before the plugins' own submit handlers.
  document.addEventListener('submit', handle, true);
})();
