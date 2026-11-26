/* Supabase integration for the CRC Potchefstroom member site. */
(function () {
  'use strict';
  const CHURCH = 'debd20d7-ab61-490e-ab73-1d37b55cb389';
  const SUPABASE_URL = 'https://tkiwlptybfmaduulovbg.supabase.co';
  const PUSH_KEY = 'BOUboBAZFV87A8QECijy-I9yyxP0wDboETm8j2dmp_QL1kdW1XlvOzSSN4C620PSrnpmCtSSfXEbpd_087YCtSg';
  let client, account, member, summary, configuration, course, units = [], attempts = [], active = false;
  let busy = false, pushWorker, installPrompt, inboxChannel, currentPage;
  const appUrl = new URL('./potch-master.html', location.href);
  let pendingInbox = location.hash === '#alerts';
  const routes = {
    home: 'Home', poll: 'Sunday availability', notifications: 'Notifications',
    academy: 'Academy', guide: 'Serving guide', attendance: 'My attendance',
    duties: 'Sunday duties', areas: 'Areas & rotations', calendar: 'Service calendar',
    events: 'Ministry events', uniform: 'Uniforms', notices: 'Send announcement',
    profile: 'My profile'
  };
  const rpc = async (name, args) => check(await client.rpc('moh16_' + name, args));
  const churchRows = (name, columns) => client.from('moh16_' + name).select(columns).eq('church_id', CHURCH);
  const formatDate = date => new Date(date.length === 10 ? date + 'T12:00:00+02:00' : date)
    .toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium' });
  const canPublish = () => summary?.administrator || summary?.roles?.some(role =>
    role.permissions?.includes('announcements.publish'));
  const allowed = route => Object.hasOwn(routes, route) && (route !== 'notices' || canPublish());
  const routeButtons = () => Object.entries(routes).filter(([route]) => allowed(route))
    .map(([route, label]) => button(label, () => page(route), 'outline'));

  document.documentElement.dataset.mohLive = 'true';
  try { window.Date = NativeDemoDate; } catch (_) {}
  const byId = id => document.getElementById(id);
  const say = text => { try { msg(text); } catch (_) { console.warn(text); } };
  const check = result => { if (result.error) throw result.error; return result.data; };
  const inform = (text, allowSignOut) => {
    screen('auth');
    byId('login').hidden = true;
    byId('auth-switch').hidden = true;
    byId('verify').hidden = false;
    byId('verified').hidden = true;
    byId('auth-title').textContent = 'CRC Potchefstroom';
    byId('auth-copy').textContent = 'Your ministry account';
    let label = byId('moh-live-status');
    if (!label) { label = document.createElement('p'); label.id = 'moh-live-status'; byId('verify').replaceChildren(label); }
    label.textContent = text;
    byId('verify').querySelector('#moh-sign-out')?.remove();
    if (allowSignOut) {
      const btn = document.createElement('button');
      btn.className = 'outline wide'; btn.textContent = 'Sign out';
      btn.id = 'moh-sign-out';
      btn.onclick = signOut;
      byId('verify').append(btn);
    }
  };
  const recoveryRedirect = () => appUrl.href + '?live=1&recovery=1';
  let recoveryFormShown = false;
  function showPasswordRecovery() {
    if (recoveryFormShown) return;
    recoveryFormShown = true;
    byId('verify').replaceChildren();
    inform('Choose a new password for your ministry account.', false);
    const form = document.createElement('form');
    const passwordInput = label => {
      const field = document.createElement('label');
      field.textContent = label;
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'new-password';
      input.required = true;
      field.append(input);
      form.append(field);
      return input;
    };
    const password = passwordInput('New password');
    const confirm = passwordInput('Confirm new password');
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'primary wide';
    submit.textContent = 'Save new password';
    const status = document.createElement('p');
    status.setAttribute('role', 'status');
    form.append(submit, status);
    byId('verify').append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (password.value !== confirm.value) {
        status.textContent = 'Passwords do not match.';
        return;
      }
      submit.disabled = true;
      try {
        check(await client.auth.updateUser({ password: password.value }));
        form.remove();
        inform('Password updated. Continue to your ministry account.', false);
        const proceed = document.createElement('button');
        proceed.type = 'button';
        proceed.className = 'primary wide';
        proceed.textContent = 'Continue';
        proceed.onclick = () => location.replace(appUrl.href);
        byId('verify').append(proceed);
      } catch (err) {
        status.textContent = err.message || 'Could not update your password.';
        submit.disabled = false;
      }
    });
  }
  const parseName = input => {
    const n = String(input || '').trim().replace(/\s+/g, ' ');
    const words = n.split(' ');
    return { first: words.shift() || 'Member', last: words.join(' ') };
  };
  function sanitizeDashboard() {
    const root = byId('home');
    if (byId('moh-live-home')) return;
    for (const child of root.children) child.hidden = true;
    const next = summary.upcoming?.[0];
    const welcome = elem('section', 'ra-panel');
    welcome.append(elem('h2', '', 'Welcome, ' + name + '.'));
    welcome.append(elem('p', 'muted', group === 'Unplaced' ? 'Contact a ministry leader for your group placement.' : 'Home group ' + group));
    if (next) {
      welcome.append(elem('p', '', next.label + ' · ' + formatDate(next.service_date) + ' · Arrive ' + next.arrival.slice(0, 5)));
    }
    welcome.id = 'moh-live-home';
    root.append(welcome);
  }
  async function loadCourses() {
    if (!member?.team_code) { course = null; units = []; attempts = []; return; }
    const team = (configuration.teams || []).find(t => t.code === member.team_code);
    const dept = team?.department_code;
    if (!dept) { course = null; units = []; attempts = []; return; }
    const rows = check(await client.from('moh16_course_versions').select('id,title,department_code,pass_mark,status').eq('church_id', CHURCH).eq('department_code', dept).eq('status', 'published').limit(1));
    course = rows?.[0] || null;
    if (!course) { units = []; attempts = []; return; }
    units = check(await client.from('moh16_course_units').select('id,title,ordinal,content,question_count,is_final').eq('church_id', CHURCH).eq('course_id', course.id).order('ordinal')) || [];
    attempts = check(await client.from('moh16_assessment_attempts').select('unit_id,passed,score,submitted_at').eq('church_id', CHURCH).eq('user_id', account.id)) || [];
  }
  function completed(unit) { return attempts.some(a => a.unit_id === unit.id && a.passed); }
  function lesson(unit) {
    const body = openModal(unit.title);
    const sections = Array.isArray(unit.content) ? unit.content : [];
    sections.forEach(section => {
      const details = document.createElement('details');
      details.className = 'guide57';
      const h = document.createElement('summary');
      h.textContent = section.heading || 'Lesson';
      details.append(h);
      if (section.text) details.append(elem('p', '', String(section.text)));
      (section.bullets || []).forEach(b => details.append(elem('p', '', '• ' + String(b))));
      body.append(details);
    });
    if (unit.question_count > 0) {
      body.append(button(completed(unit) ? 'Already passed' : 'Start knowledge check', () => { closeModal(); beginAssessment(unit); }, 'primary wide'));
      body.lastChild.disabled = completed(unit);
    }
  }
  async function beginAssessment(unit) {
    if (busy) return;
    busy = true;
    try {
      const res = check(await client.rpc('moh16_start_assessment', { p_church: CHURCH, p_unit: unit.id }));
      const qs = res?.questions || [];
      if (!qs.length) throw Error('No questions were returned.');
      const box = openModal('Knowledge check · ' + unit.title);
      const f = document.createElement('form');
      const selects = qs.map((q, i) => {
        const label = document.createElement('label');
        label.textContent = (i + 1) + '. ' + q.prompt;
        const s = document.createElement('select');
        s.required = true;
        s.append(new Option('Choose an answer', ''));
        (q.options || []).forEach((option, j) => s.append(new Option(String(option), String(j))));
        label.append(s); f.append(label);
        return s;
      });
      const submit = document.createElement('button');
      submit.type = 'submit'; submit.className = 'primary wide'; submit.textContent = 'Submit assessment';
      f.append(submit);
      f.onsubmit = async e => {
        e.preventDefault();
        if (busy) return;
        busy = true; submit.disabled = true;
        try {
          const answers = selects.map(s => Number(s.value));
          const result = check(await client.rpc('moh16_submit_assessment', { p_church: CHURCH, p_attempt: res.attempt_id, p_answers: answers }));
          closeModal();
          say((result.passed ? 'Passed' : 'Not passed') + ' · ' + result.score + '%');
          await loadCourses(); renderAcademy57();
        } catch (err) { say(err.message || 'Assessment not saved'); }
        finally { busy = false; submit.disabled = false; }
      };
      box.append(f);
    } catch (err) { say(err.message || 'Assessment unavailable'); }
    finally { busy = false; }
  }
  function liveAcademy() {
    const root = root57('academy');
    const passed = units.filter(completed).length;
    strip57(root, 'RED ARMY ACADEMY · LIVE', passed + ' / ' + units.length, 'Official published course · Supabase assessment records');
    progress57(root, units.length ? passed / units.length * 100 : 0);
    if (!course) { root.append(elem('p', 'muted', 'No published course is assigned to this member yet.')); return; }
    root.append(elem('p', 'muted', course.title + ' · Pass mark ' + course.pass_mark + '%'));
    units.forEach((u, i) => {
      const row = button('', () => lesson(u), 'line57 module57');
      const title = elem('div');
      title.append(elem('b', '', u.title), elem('small', '', completed(u) ? 'Passed · verified in Supabase' : (u.is_final ? 'Final assessment' : 'Read lesson · knowledge check')));
      row.append(elem('div', 'num57', String(i + 1).padStart(2, '0')), title, elem('span', completed(u) ? 'done57' : '', completed(u) ? '✓' : '›'));
      root.append(row);
    });
  }
  const localSunday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    const date = new Date(values.year + '-' + values.month + '-' + values.day + 'T12:00:00Z');
    date.setUTCDate(date.getUTCDate() + (7 - date.getUTCDay()) % 7);
    return date.toISOString().slice(0, 10);
  };

  function moduleForm(root, fields, label, submit) {
    const form = document.createElement('form');
    const save = elem('button', 'primary wide', label);
    save.type = 'submit';
    const status = elem('p', 'muted');
    status.setAttribute('role', 'status');
    form.append(...fields, save, status);
    form.onsubmit = async event => {
      event.preventDefault();
      save.disabled = true;
      status.textContent = '';
      try { status.textContent = await submit(form); }
      catch (error) { status.textContent = error.message; }
      finally { save.disabled = false; }
    };
    root.append(form);
    return form;
  }

  async function renderPoll(root) {
    const date = input('date', localSunday());
    date.required = true;
    const reason = document.createElement('textarea');
    const options = (configuration.services || []).map(service => {
      const choice = document.createElement('select');
      choice.add(new Option('Leave unchanged', ''));
      choice.add(new Option('Available', 'available'));
      choice.add(new Option('Not serving', 'not_serving'));
      return { service, choice };
    });
    const form = moduleForm(root, [field('Sunday', date),
      ...options.map(({ service, choice }) => field(service.label, choice)),
      field('Reason for not serving', reason)], 'Save availability', async () => {
      if (new Date(date.value + 'T12:00:00Z').getUTCDay() !== 0) throw Error('Select a Sunday.');
      const votes = options.filter(({ choice }) => choice.value).map(({ service, choice }) => ({
        service: service.code,
        choice: choice.value,
        reason: choice.value === 'not_serving' ? reason.value.trim() : ''
      }));
      if (!votes.length || votes.some(vote => vote.choice === 'not_serving' && !vote.reason)) {
        throw Error('Choose availability and give a reason for any service you cannot attend.');
      }
      await rpc('submit_sunday_availability', { p_church: CHURCH, p_date: date.value, p_votes: votes });
      return 'Availability saved.';
    });
    async function loadVote() {
      const requested = date.value;
      const save = form.querySelector('button');
      save.disabled = true;
      try {
        const rows = check(await churchRows('availability', 'service_code,choice,reason')
          .eq('user_id', account.id).eq('service_date', requested));
        if (date.value !== requested) return;
        for (const { service, choice } of options) choice.value = rows.find(row => row.service_code === service.code)?.choice || '';
        reason.value = rows.find(row => row.reason)?.reason || '';
      } catch (error) { if (date.value === requested) form.lastElementChild.textContent = error.message; }
      finally { if (date.value === requested) save.disabled = false; }
    }
    date.onchange = loadVote;
    await loadVote();
  }

  function publishNotice(root) {
    const title = input('text', '');
    title.required = true;
    title.maxLength = 200;
    const body = document.createElement('textarea');
    body.required = true;
    body.maxLength = 4000;
    const team = document.createElement('select');
    team.add(new Option('Entire campus', ''));
    for (const item of configuration.teams || []) team.add(new Option(item.label || item.code, item.code));
    const groupSelect = document.createElement('select');
    const setGroups = () => {
      groupSelect.replaceChildren(new Option('All groups in selected audience', ''));
      for (const item of configuration.groups || []) {
        if (item.team_code === team.value) groupSelect.add(new Option(item.label || item.code, item.code));
      }
    };
    team.onchange = setGroups;
    setGroups();
    moduleForm(root, [field('Title', title), field('Message', body),
      field('Team', team), field('Group', groupSelect)], 'Send announcement', async form => {
      if (!title.value.trim() || !body.value.trim()) throw Error('Enter a title and message.');
      await rpc('publish_announcement', {
        p_church: CHURCH, p_title: title.value.trim(), p_body: body.value.trim(),
        p_team: team.value || null, p_group: groupSelect.value || null
      });
      form.reset();
      setGroups();
      return 'Announcement sent to the selected audience.';
    });
  }

  function showRows(root, rows, render, empty) {
    if (!rows.length) root.append(elem('p', 'muted', empty));
    for (const row of rows) render(row);
  }

  async function renderModule(route, root) {
    if (route === 'poll') return renderPoll(root);
    if (route === 'notices') return publishNotice(root);
    if (route === 'calendar') {
      return showRows(root, summary.upcoming || [], service => line57(root, service.label,
        formatDate(service.service_date) + ' · Starts ' + service.starts.slice(0, 5)), 'No services scheduled for the next week.');
    }
    if (route === 'attendance') {
      const rows = check(await churchRows('attendance', 'service_date,service_code,status')
        .eq('user_id', account.id).order('service_date', { ascending: false }).limit(52));
      return showRows(root, rows, row => line57(root, formatDate(row.service_date),
        row.service_code.toUpperCase() + ' · ' + row.status.replaceAll('_', ' ')), 'No attendance recorded yet.');
    }
    if (route === 'areas') {
      const date = input('date', localSunday());
      date.required = true;
      const service = document.createElement('select');
      for (const item of configuration.services || []) service.add(new Option(item.label, item.code));
      const schedule = elem('div');
      moduleForm(root, [field('Date', date), field('Service', service)], 'View areas', async () => {
        const rows = await rpc('area_schedule', { p_church: CHURCH, p_service: service.value, p_date: date.value });
        schedule.replaceChildren();
        showRows(schedule, Array.isArray(rows) ? rows : rows?.assignments || [], row => line57(schedule,
          row.area_label || row.area_name || row.area_code, row.group_label || row.group_code || ''),
          'No published area assignments for this service.');
        return '';
      });
      root.append(schedule);
      return;
    }
    if (route === 'duties') {
      const rows = check(await churchRows('duty_tasks', 'id,title,description,service_date,service_code,completed_at')
        .gte('service_date', localSunday()).order('service_date').limit(50));
      return showRows(root, rows, row => line57(root, row.title,
        [formatDate(row.service_date), row.service_code.toUpperCase(), row.description,
          row.completed_at ? 'Completed' : ''].filter(Boolean).join(' · ')), 'No upcoming duties are assigned.');
    }
    if (route === 'guide') {
      const rows = check(await churchRows('guide_versions', 'code,title,content,version').eq('status', 'published')
        .order('code').order('version', { ascending: false }));
      const latest = rows.filter((row, index) => index === 0 || rows[index - 1].code !== row.code);
      return showRows(root, latest, row => {
        const details = document.createElement('details');
        details.className = 'guide57';
        details.append(elem('summary', '', row.title));
        const sections = Array.isArray(row.content) ? row.content : row.content?.sections || [];
        for (const section of sections) {
          if (section.heading) details.append(elem('h3', '', section.heading));
          if (section.text) details.append(elem('p', '', section.text));
          for (const item of section.bullets || []) details.append(elem('p', '', '• ' + item));
        }
        root.append(details);
      }, 'No serving guide has been published.');
    }
    if (route === 'events') {
      const rows = check(await churchRows('event_sessions', 'id,title,starts_at,deadline,status')
        .eq('status', 'published').gte('starts_at', new Date().toISOString()).order('starts_at').limit(30));
      return showRows(root, rows, row => line57(root, row.title, formatDate(row.starts_at),
        button('Respond', () => respondToEvent(row), 'outline')), 'No upcoming events are available.');
    }
    if (route === 'uniform') return renderUniforms(root);
  }

  function respondToEvent(row) {
    const modal = openModal(row.title);
    const choice = document.createElement('select');
    choice.add(new Option('Available', 'available'));
    choice.add(new Option('Decline', 'declined'));
    const reason = document.createElement('textarea');
    moduleForm(modal, [field('Response', choice), field('Reason', reason)], 'Save response', async () => {
      await rpc('respond_event', {
        p_church: CHURCH, p_session: row.id, p_choice: choice.value, p_arrival: null, p_reason: reason.value.trim()
      });
      return 'Response saved.';
    });
  }

  async function renderUniforms(root) {
    const rows = check(await churchRows('uniform_campaigns', 'id,title,closes_at,instructions,status').order('closes_at', { ascending: false }));
    showRows(root, rows, row => line57(root, row.title,
      [row.status, row.closes_at && formatDate(row.closes_at), row.instructions].filter(Boolean).join(' · ')),
    'No uniform campaigns are available.');
  }

  function configureInstall() {
    const footer = byId('welcome').querySelector('footer');
    footer.textContent = 'CRC Potchefstroom · Ministry of Helps';
    const control = button('Add to Home Screen', async () => {
      if (installPrompt) {
        await installPrompt.prompt();
        installPrompt = null;
        return;
      }
      openModal('Add to Home Screen').append(elem('p', '',
        'On iPhone or iPad, use Safari’s Share menu and choose Add to Home Screen. On Android and desktop, look for Install app in your browser menu.'));
    }, 'outline');
    footer.append(control);
    control.hidden = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
    window.addEventListener('appinstalled', () => { control.hidden = true; installPrompt = null; });
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('../sw.js').then(async () => {
        pushWorker = await navigator.serviceWorker.ready;
      }).catch(error => console.warn('App installation unavailable:', error.message));
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data?.type !== 'open-alerts') return;
        pendingInbox = true;
        if (active) page('notifications');
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshInbox();
    });
    window.setInterval(() => { if (!document.hidden) refreshInbox(); }, 45000);
  }

  async function savePush(subscription, enabled) {
    const keys = subscription.toJSON().keys;
    await rpc('save_web_push', {
      p_church: CHURCH, p_endpoint: subscription.endpoint,
      p_p256dh: enabled ? keys.p256dh : null, p_auth: enabled ? keys.auth : null,
    });
  }

  async function disablePush() {
    const subscription = await pushWorker?.pushManager?.getSubscription();
    if (!subscription) return;
    await savePush(subscription, false);
    await subscription.unsubscribe();
  }

  async function signOut() {
    try {
      await disablePush();
      check(await client.auth.signOut({ scope: 'local' }));
      location.replace(appUrl.href);
    } catch (error) { say(error.message || 'Could not sign out. Please try again.'); }
  }

  async function subscribePush() {
    if (!pushWorker?.pushManager || !('Notification' in window)) {
      throw Error('Open the installed app on iPhone or iPad, or use a browser that supports push.');
    }
    if (await Notification.requestPermission() !== 'granted') {
      throw Error('Allow notifications in your browser settings, then try again.');
    }
    let sub = await pushWorker.pushManager.getSubscription();
    try {
      sub ??= await pushWorker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: PUSH_KEY });
      await savePush(sub, true);
    } catch (error) {
      if (sub) await sub.unsubscribe();
      throw error;
    }
  }

  async function liveNotifications() {
    const root = root57('notifications');
    strip57(root, 'MINISTRY ALERTS', 'Notifications', 'Your ministry inbox');
    const tools = elem('div');
    tools.id = 'moh-live-inbox-tools';
    const status = elem('p', 'muted');
    status.id = 'moh-live-inbox-status';
    status.setAttribute('role', 'status');
    const setting = button('Enable device notifications', async () => {
      setting.disabled = true;
      try {
        if (await pushWorker?.pushManager?.getSubscription()) {
          await disablePush();
          setting.textContent = 'Enable device notifications';
          status.textContent = 'Device notifications disabled.';
        } else {
          await subscribePush();
          setting.textContent = 'Disable device notifications';
          status.textContent = 'Device notifications enabled.';
        }
      } catch (err) { status.textContent = err.message; }
      finally { setting.disabled = false; }
    }, 'outline');
    const test = button('Send me a test alert', async () => {
      test.disabled = true;
      try {
        const created = await rpc('create_potch_test_notification');
        status.textContent = created ? 'Test alert added to your inbox.' : 'You already sent a test alert today.';
        await refreshInbox();
      } catch (err) { status.textContent = err.message; }
      finally { test.disabled = false; }
    }, 'outline');
    tools.append(setting, test, status);
    const rows = elem('div');
    rows.id = 'moh-live-inbox';
    root.append(tools, rows);
    try {
      if (await pushWorker?.pushManager?.getSubscription()) setting.textContent = 'Disable device notifications';
    } catch { /* The enable button will report unavailable push. */ }
    await refreshInbox();
  }

  let inboxGeneration = 0;
  async function refreshInbox() {
    if (!active) return;
    const generation = ++inboxGeneration;
    const list = byId('moh-live-inbox');
    try {
      const rows = check(await churchRows('notifications', 'id,title,body,created_at,read_at')
        .eq('user_id', account.id).order('created_at', { ascending: false }).limit(50));
      if (generation !== inboxGeneration) return;
      const count = rows.filter(row => !row.read_at).length;
      const badge = byId('moh-inbox-badge');
      if (badge) {
        badge.textContent = String(count);
        badge.hidden = count === 0;
      }
      if (currentPage !== 'notifications' || !list?.isConnected) return;
      list.replaceChildren();
      if (!rows.length) list.append(elem('p', 'muted', 'No ministry notifications yet.'));
      for (const row of rows) {
        const mark = row.read_at ? null : button('Mark read', async () => {
          try {
            await rpc('read_notification', { p_church: CHURCH, p_id: row.id });
            await refreshInbox();
          } catch (err) { say(err.message); }
        }, 'outline');
        line57(list, row.title || 'Ministry update',
          [row.body, formatDate(row.created_at), row.read_at ? 'Read' : 'Unread'].filter(Boolean).join(' · '), mark);
      }
    } catch (err) {
      if (generation === inboxGeneration && currentPage === 'notifications' && list?.isConnected) list.textContent = err.message;
    }
  }

  function safeProfile() {
    const root = byId('profile');
    if (!root) return;
    const cardID = root.querySelector('.pass-top span:nth-child(2)');
    if (cardID) cardID.textContent = 'AUTHENTICATED MEMBER';
    const previewQR = root.querySelector('.pass-qr');
    if (previewQR) previewQR.hidden = true;
    for (const id of ['served-total', 'streak-total', 'years-serving']) {
      if (byId(id)) byId(id).textContent = '—';
    }
    byId('profile-timeline')?.replaceChildren();
    byId('edit-profile').onclick = () => {
      const modal = openModal('Edit display name');
      const label = document.createElement('label');
      label.textContent = 'Full name';
      const input = document.createElement('input');
      input.required = true; input.maxLength = 120;
      input.value = name + (last ? ' ' + last : '');
      label.append(input);
      const form = document.createElement('form');
      const submit = document.createElement('button');
      submit.className = 'primary wide'; submit.textContent = 'Save name'; submit.type = 'submit';
      form.append(label, submit);
      form.onsubmit = async e => {
        e.preventDefault();
        if (busy) return;
        const v = input.value.trim();
        if (v.length < 2) return say('Enter your full name.');
        busy = true; submit.disabled = true;
        try {
          check(await client.rpc('moh16_save_identity', { p_name: v }));
          const parsed = parseName(v);
          name = parsed.first; last = parsed.last;
          summary.display_name = v;
          const self = roster.find(m => m.id === 'self');
          if (self) self.name = v;
          closeModal(); renderProfile(); safeProfile();
          byId('member-name').textContent = v;
          say('Name saved in Supabase.');
        } catch (err) { say(err.message || 'Could not update your name'); }
        finally { busy = false; submit.disabled = false; }
      };
      modal.append(form);
    };
    byId('edit-account').onclick = () => {
      const modal = openModal('Account settings');
      modal.append(elem('p', 'muted', 'Signed in as ' + account.email));
      modal.append(button('Send password reset email', async () => {
        try { check(await client.auth.resetPasswordForEmail(account.email, { redirectTo: recoveryRedirect() })); say('Password reset email requested.'); }
        catch (err) { say(err.message || 'Could not request reset'); }
      }, 'outline wide'));
      modal.append(button('Sign out', signOut, 'outline wide'));
    };
    if (byId('show-achievement')) byId('show-achievement').onclick = () => page('academy');
  }

  async function enter(user) {
    if (!user) { active = false; screen('welcome'); return; }
    account = user;
    const memberships = check(await client.from('moh16_memberships').select('church_id,access_level,active').eq('church_id', CHURCH).eq('user_id', user.id).eq('active', true).limit(1));
    if (!memberships?.length) {
      active = false;
      byId('verify').replaceChildren();
      inform('Choose your trainee group to open the Academy.', true);
      const panel = byId('verify');
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Trainee group';
      const select = document.createElement('select');
      select.required = true;
      select.add(new Option('Choose a group', ''));
      for (const [code, title] of [
        ['amuit', 'AM Usher'], ['amhit', 'AM Hostess'],
        ['pmuit', 'PM Usher'], ['pmhit', 'PM Hostess']
      ]) select.add(new Option(title, code));
      label.append(select);
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'primary wide';
      submit.textContent = 'Continue';
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      form.append(label, submit, status);
      panel.prepend(form);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          check(await client.rpc('moh16_self_register_potch', { p_group: select.value }));
          await enter(user);
          page('academy');
          form.remove();
        } catch (err) {
          status.textContent = err.message || 'Could not complete registration.';
          submit.disabled = false;
        }
      });
      return;
    }
    summary = check(await client.rpc('moh16_dashboard', { p_church: CHURCH }));
    configuration = check(await client.rpc('moh16_get_configuration', { p_church: CHURCH }));
    if (!summary || !configuration) throw Error('Church data could not be loaded.');
    const identity = check(await client.from('moh16_identities').select('display_name').eq('user_id', user.id).maybeSingle());
    const displayed = identity?.display_name || summary.display_name || user.email?.split('@')[0] || 'Member';
    const parsed = parseName(displayed);
    member = summary.placement || {};
    name = parsed.first; last = parsed.last;
    group = member.group_code ? member.group_code.toUpperCase() : 'Unplaced';
    person.phone = ''; person.birth = ''; person.year = ''; person.photo = '';
    state.vote = null;
    demoActorId = 'self';
    const roleLabel = summary.roles?.[0]?.label || (group.endsWith('IT') ? 'Trainee' : 'Member');
    roster.splice(0, roster.length, { id: 'self', name: displayed, group, role: roleLabel, vote: null });
    const selectRole = byId('role-switch');
    selectRole.replaceChildren(new Option(roleLabel, roleLabel)); selectRole.value = roleLabel;
    selectRole.closest('label').hidden = true;
    if (window.demoControls) window.demoControls.hidden = true;
    active = true;
    renderAcademy57 = liveAcademy;
    dashboard();
    page = openLivePage;
    if (typeof raContext !== 'undefined') raContext.hidden = true;
    const top = byId('work-title').parentElement;
    const nav = elem('nav', 'moh-live-links');
    nav.setAttribute('aria-label', 'Member navigation');
    nav.append(...routeButtons());
    nav.append(button('Sign out', signOut, 'outline'));
    top.after(nav);
    byId('sidebar').hidden = true;
    byId('open-nav').hidden = true;
    const alert = top.querySelector('[data-page="notifications"]');
    if (alert) {
      alert.onclick = () => page('notifications');
      const badge = elem('span');
      badge.id = 'moh-inbox-badge';
      badge.hidden = true;
      alert.append(badge);
    }
    const tabs = byId('app').querySelector('.bottom-tabs');
    if (tabs) tabs.hidden = true;
    page(pendingInbox ? 'notifications' : 'home');
    if (inboxChannel) await client.removeChannel(inboxChannel);
    inboxChannel = client.channel('moh-inbox-' + user.id).on('postgres_changes', {
      event: '*', schema: 'public', table: 'moh16_notifications', filter: 'user_id=eq.' + user.id
    }, refreshInbox).subscribe(refreshInbox);
  }

  function openLivePage(route) {
    if (!active || !allowed(route)) return;
    currentPage = route;
    closeNav();
    window.scrollTo(0, 0);
    byId('work-title').textContent = routes[route];
    const content = byId('home').parentElement;
    for (const section of content.children) section.hidden = true;
    if (['home', 'profile', 'academy', 'notifications'].includes(route)) {
      byId(route).hidden = false;
      if (route === 'home') sanitizeDashboard();
      if (route === 'profile') { renderProfile(); safeProfile(); }
      if (route === 'academy') {
        root57('academy').append(elem('p', 'muted', 'Loading Academy…'));
        loadCourses().then(() => { if (currentPage === 'academy') liveAcademy(); })
          .catch(error => { if (currentPage === 'academy') root57('academy').textContent = error.message; });
      }
      if (route === 'notifications') liveNotifications();
      return;
    }
    let section = byId('moh-live-module');
    if (!section) {
      section = elem('section', 'ra-panel');
      section.id = 'moh-live-module';
      content.append(section);
    }
    section.replaceChildren(elem('h2', '', routes[route]));
    section.hidden = false;
    const mount = elem('div');
    section.append(mount);
    renderModule(route, mount).catch(err => { mount.textContent = err.message; });
  }

  async function submitCredentials(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!client || busy) return say('Connection is still loading.');
    const f = e.target, email = String(f.elements.email.value || '').trim(), password = f.elements.password.value;
    busy = true; byId('auth-submit').disabled = true;
    try {
      if (mode === 'signup') {
        if (password !== f.elements.confirm.value) return say('Passwords do not match.');
        const result = check(await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + appUrl.href } }));
        if (result?.session) await enter(result.user);
        else {
          inform('Check your email for the confirmation link. Then sign in to select your trainee group.', false);
          byId('verify').append(button('Return to sign-in', () => auth('signin'), 'outline wide'));
        }
      } else {
        const result = check(await client.auth.signInWithPassword({ email, password }));
        await enter(result.user);
      }
    } catch (err) { say(err.message || 'Unable to sign in'); }
    finally { busy = false; byId('auth-submit').disabled = false; }
  }
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    const login = byId('login');
    auth = function (nextMode) {
      mode = nextMode;
      screen('auth');
      login.hidden = false;
      byId('verify').hidden = true;
      byId('auth-switch').hidden = false;
      byId('confirm-label').hidden = mode !== 'signup';
      login.elements.confirm.required = mode === 'signup';
      login.elements.password.autocomplete = mode === 'signup' ? 'new-password' : 'current-password';
      byId('forgot').hidden = mode !== 'signin';
      byId('auth-title').textContent = mode === 'signup' ? 'Join the team.' : 'Welcome back.';
      byId('auth-copy').textContent = mode === 'signup' ? 'Create your CRC Potchefstroom ministry account.' : 'Sign in to your CRC Potchefstroom ministry account.';
      byId('auth-submit').textContent = mode === 'signup' ? 'Create account' : 'Sign in';
      document.querySelectorAll('[data-mode]').forEach(control => control.setAttribute('aria-selected', String(control.dataset.mode === mode)));
    };
    document.querySelectorAll('[data-auth],[data-mode]').forEach(control => {
      control.onclick = () => auth(control.dataset.auth || control.dataset.mode);
    });
    byId('auth').querySelector('[data-home]').onclick = () => screen('welcome');
    byId('network-admin').hidden = true;
    byId('network-lab').hidden = true;
    byId('jump').removeAttribute('title');
    configureInstall();
    login.elements.email.value = ''; login.elements.password.value = ''; login.elements.confirm.value = '';
    login.onsubmit = null;
    login.addEventListener('submit', submitCredentials, true);
    byId('jump').onclick = () => auth('signin');
    byId('jump').textContent = 'Sign in ↗';
    byId('jump').setAttribute('aria-label', 'Sign in to the live ministry workspace');
    byId('forgot').onclick = async () => {
      const email = String(login.elements.email.value || '').trim();
      if (!email) return say('Enter your email address first.');
      try { check(await client.auth.resetPasswordForEmail(email, { redirectTo: recoveryRedirect() })); say('If your account exists, a password reset email will arrive.'); }
      catch (err) { say(err.message || 'Password reset unavailable'); }
    };
    try {
      let mod;
      try { mod = await import('https://esm.sh/@supabase/supabase-js@2.110.0'); }
      catch (_) { mod = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.0/+esm'); }
      client = mod.createClient(SUPABASE_URL, "sb_publishable_k8PRKFpCTvh9qU5q4GOv2Q_coh9uu69", {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      delete window.__MOH_PUBLISHABLE_KEY__;
      const recoveryRequested = new URLSearchParams(location.search).get('recovery') === '1' ||
        new URLSearchParams(location.hash.slice(1)).get('type') === 'recovery';
      let recoveryEvent = false;
      client.auth.onAuthStateChange(event => {
        if (event !== 'PASSWORD_RECOVERY') return;
        recoveryEvent = true;
        showPasswordRecovery();
      });
      if (recoveryRequested) {
        await client.auth.getSession();
        if (!recoveryEvent) {
          inform('This password reset link is invalid or expired.', false);
          const retry = document.createElement('button');
          retry.type = 'button';
          retry.className = 'outline wide';
          retry.textContent = 'Return to sign-in';
          retry.onclick = () => location.replace(appUrl.href);
          byId('verify').append(retry);
        }
        return;
      }
      const result = await client.auth.getUser();
      if (recoveryEvent) return;
      if (result.data?.user) await enter(result.data.user);
      else screen('welcome');
    } catch (err) { inform('Live connection unavailable: ' + (err.message || 'Check the site configuration.'), false); }
  }
  window.addEventListener('DOMContentLoaded', start, { once: true });
  if (document.readyState !== 'loading') start();
})();
