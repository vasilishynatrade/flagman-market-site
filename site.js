function initializeEnquiry(form) {
  const params = new URLSearchParams(window.location.search);
  const category = form.elements.namedItem('category');
  const product = form.elements.namedItem('product');
  const type = form.elements.namedItem('type');
  const title = document.querySelector('[data-form-title]');
  const success = form.querySelector('[data-success]');
  const summary = Object.fromEntries(Array.from(document.querySelectorAll('[data-field-summary]'), (element) => [
    element.dataset.fieldSummary, element,
  ]));
  const categoryOptions = new Map(Array.from(form.querySelectorAll('template[data-products]'), (template) => [
    template.dataset.products, Array.from(template.content.querySelectorAll('option')),
  ]));
  const languageLinks = document.querySelectorAll('[data-lang-switch]');
  const draftKey = 'flagman-editorial-enquiry';
  const draftFields = ['name', 'company', 'email', 'phone', 'country', 'volume', 'message'];

  function updateProducts(selected = '') {
    const options = categoryOptions.get(category.value);
    const placeholder = new Option(options ? product.dataset.pick : product.dataset.pickFirst, '');
    product.replaceChildren(placeholder, ...(options ?? []).map((option) => option.cloneNode(true)));
    product.disabled = !options;
    product.value = options?.some((option) => option.value === selected) ? selected : '';
  }

  const selected = params.get('product');
  const preselectedCategory = params.get('category');
  const matchingCategory = Array.from(categoryOptions).find(([, options]) => options.some((option) => option.value === selected));
  category.value = categoryOptions.has(preselectedCategory) ? preselectedCategory : matchingCategory?.[0] ?? '';
  updateProducts(selected);
  type.value = ['spec', 'sample'].includes(params.get('type')) ? params.get('type') : 'quote';
  title.textContent = { spec: title.dataset.specTitle, sample: title.dataset.sampleTitle }[type.value] || title.dataset.quoteTitle;

  // Keep typed fields in this tab when the buyer explicitly changes language.
  try {
    const draft = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
    sessionStorage.removeItem(draftKey);
    if (draft?.destination === window.location.pathname) {
      for (const name of draftFields) {
        if (typeof draft.fields?.[name] === 'string') form.elements.namedItem(name).value = draft.fields[name];
      }
    }
  } catch {
    // Preview navigation also works when browser storage is unavailable.
  }

  function updateLanguageLinks() {
    const state = new URLSearchParams({ type: type.value });
    if (category.value) state.set('category', category.value);
    if (product.value) state.set('product', product.value);
    for (const link of languageLinks) {
      const destination = new URL(link.href);
      destination.search = state.toString();
      link.href = destination.href;
    }
  }

  function updateSummary() {
    summary.category.textContent = category.value ? category.selectedOptions[0].textContent : '—';
    summary.product.textContent = product.value ? product.selectedOptions[0].textContent : '—';
    summary.country.textContent = form.elements.namedItem('country').value.trim() || '—';
    summary.volume.textContent = form.elements.namedItem('volume').value.trim() || '—';
  }

  for (const link of languageLinks) {
    if (link.hasAttribute('aria-current')) continue;
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      try {
        const fields = Object.fromEntries(draftFields.map((name) => [name, form.elements.namedItem(name).value]));
        sessionStorage.setItem(draftKey, JSON.stringify({ destination: new URL(link.href).pathname, fields }));
      } catch {
        // Language navigation still works without draft storage.
      }
    });
  }

  category.addEventListener('change', () => {
    updateProducts();
    updateLanguageLinks();
    updateSummary();
  });
  product.addEventListener('change', () => {
    updateLanguageLinks();
    updateSummary();
  });
  form.addEventListener('input', () => {
    success.hidden = true;
    updateSummary();
  });
  const successTitle = success.querySelector('[data-success-title]');
  const successText = success.querySelector('[data-success-text]');
  const submitButton = form.querySelector('button[type="submit"]');

  function showResult(kind) {
    const d = form.dataset;
    const texts = {
      sent: [d.sentTitle, d.sent],
      mail: [d.mailTitle, d.mail],
      error: ['', d.error],
    }[kind];
    if (successTitle) successTitle.textContent = texts[0];
    if (successText) successText.textContent = texts[1];
    success.classList.toggle('is-error', kind === 'error');
    success.hidden = false;
    success.focus();
  }

  function collect() {
    const data = {
      request_type: { spec: 'Specification', sample: 'Sample' }[type.value] || 'Offer',
      category: category.value ? category.selectedOptions[0].textContent : '',
      product: product.value ? product.selectedOptions[0].textContent : '',
    };
    for (const name of ['country', 'volume', 'name', 'company', 'email', 'phone', 'message']) {
      const value = form.elements.namedItem(name).value.trim();
      if (value) data[name] = value;
    }
    data.page_language = document.documentElement.lang;
    return data;
  }

  function openMail(data) {
    const lines = Object.entries(data).map(([key, value]) => `${key}: ${value}`);
    const subject = `Flagman Market enquiry: ${data.product || ''} — ${data.company || ''}`;
    window.location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    showResult('mail');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = collect();
    const endpoint = form.dataset.endpoint;
    if (!endpoint) { openMail(data); return; }
    submitButton.disabled = true;
    try {
      const body = { ...data, _subject: `Flagman Market: ${data.request_type} — ${data.product} — ${data.company}`, _template: 'table', _captcha: 'false', _replyto: data.email };
      if (form.dataset.key) body.access_key = form.dataset.key;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(String(response.status));
      showResult('sent');
      form.reset();
      updateProducts();
      updateSummary();
    } catch {
      openMail(data);
    } finally {
      submitButton.disabled = false;
    }
  });

  updateLanguageLinks();
  updateSummary();
  form.querySelector('.form-controls').disabled = false;
}

const enquiry = document.querySelector('#enquiry-form');
if (enquiry) initializeEnquiry(enquiry);

// Новая страница всегда открывается сверху.
// Окно превью может само вернуть старую прокрутку уже после загрузки,
// поэтому первые 2 секунды держим страницу наверху, пока человек сам не начнёт листать.
(function keepTop() {
  if (location.hash) return;
  try { history.scrollRestoration = 'manual'; } catch (e) { /* старые браузеры */ }
  let userMoved = false;
  const stop = () => { userMoved = true; };
  ['wheel', 'touchstart', 'keydown', 'mousedown'].forEach((ev) => window.addEventListener(ev, stop, { once: true, passive: true }));
  const toTop = () => { if (!userMoved && (window.scrollY || document.documentElement.scrollTop) > 0) window.scrollTo(0, 0); };
  toTop();
  window.addEventListener('scroll', toTop, { passive: true });
  window.addEventListener('load', toTop);
  window.addEventListener('pageshow', toTop);
  [50, 150, 300, 600, 1000, 1500].forEach((t) => setTimeout(toTop, t));
  setTimeout(() => window.removeEventListener('scroll', toTop), 2000);
})();
