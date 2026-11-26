(function () {
  'use strict';
  const welcomePhoto = document.querySelector('#welcome .hero-photo');
  if (welcomePhoto) {
    const style = document.createElement('style');
    style.textContent = "\n#welcome .hero-photo .moh-photo-lockup{position:absolute;inset:0;z-index:2;display:grid;place-content:center;justify-items:center;gap:.35rem;background:#270c18;color:#fff;pointer-events:none;visibility:hidden}\n#welcome .hero-photo .moh-intro-playing{visibility:visible;animation:moh-intro-curtain .65s 1.28s both}\n.moh-thread{width:min(78vw,620px,90cqw);max-width:100%;overflow:visible}\n#welcome .hero-photo{container-type:inline-size}\n.moh-thread path{fill:none;stroke:#ff6d88;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1}\n.moh-intro-playing .moh-thread path{animation:moh-intro-write 1.28s cubic-bezier(.36,.1,.5,1) both}\n.moh-photo-lockup small{margin-top:.85rem;color:#fff;font-size:clamp(.7rem,2vw,1rem);font-weight:800;letter-spacing:.24em;text-transform:uppercase}\n.moh-intro-playing small{animation:moh-intro-caption .4s .9s both}\n#welcome .word-mask>span{animation-delay:1.14s}\n#welcome .word-mask:nth-child(2)>span{animation-delay:1.26s}\n#moh-replay{position:absolute;z-index:4;right:1rem;bottom:1rem;background:#270c18;color:white;border:1px solid #ffb6c4;border-radius:100px;min-height:44px;padding:.62rem 1rem;cursor:pointer}\n#moh-replay:focus-visible{outline:2px solid white;outline-offset:3px}\n@keyframes moh-intro-write{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}\n@keyframes moh-intro-caption{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:none}}\n@keyframes moh-intro-curtain{from{clip-path:inset(0);opacity:1}to{clip-path:inset(0 0 100% 0);opacity:0;visibility:hidden}}\n@media(prefers-reduced-motion:reduce){#welcome .hero-photo .moh-photo-lockup,#moh-replay{display:none}#welcome .word-mask>span,#welcome .word-mask:nth-child(2)>span{animation:none!important;transform:none;opacity:1}}\n";
    document.head.append(style);
    welcomePhoto.insertAdjacentHTML('afterbegin', "<div class=\"moh-photo-lockup moh-intro-playing\" role=\"img\" aria-label=\"MOH · Ministry of Helps\">\n<svg aria-hidden=\"true\" class=\"moh-thread\" viewBox=\"0 0 340 115\">\n<path pathLength=\"1\" d=\"M4 87 C21 108 37 45 17 49 C-2 53 28 94 47 90\nL47 21 Q48 12 55 23 L80 67 L104 23 Q112 12 112 23 L112 88\nQ117 98 129 91 L151 72 C131 43 148 14 172 15 C202 14 211 38 206 62\nC202 93 171 106 151 72 Q163 109 226 90 L226 23 Q226 12 230 19\nL230 94 L230 58 L280 58 L280 20 L280 91 C291 108 316 72 335 79\"/>\n</svg><small aria-hidden=\"true\">Ministry of Helps</small></div><button id=\"moh-replay\" type=\"button\">Replay intro</button>");
    (() => {
      const intro = document.querySelector('#welcome .moh-photo-lockup');
      const words = [...document.querySelectorAll('#welcome .word-mask>span')];
      document.getElementById('moh-replay').addEventListener('click', () => {
        intro.classList.remove('moh-intro-playing');
        words.forEach(word => { word.style.animation = 'none'; });
        void intro.offsetWidth;
        intro.classList.add('moh-intro-playing');
        words.forEach(word => { word.style.removeProperty('animation'); });
      });
    })();
  }
  const CHURCH = 'debd20d7-ab61-490e-ab73-1d37b55cb389';
  const URL = 'https://tkiwlptybfmaduulovbg.supabase.co';
  let client, account, member, summary, configuration, course, units = [], attempts = [], active = false;
  let busy = false;
  document.documentElement.dataset.mohLive = 'true';
  const byId = id => document.getElementById(id);
  const say = text => { try { msg(text); } catch (_) { console.warn(text); } };
  const check = result => { if (result.error) throw result.error; return result.data; };
  const inform = (text, allowSignOut) => {
    screen('auth');
    byId('login').hidden = true;
    byId('auth-switch').hidden = true;
    byId('verify').hidden = false;
    const previous = byId('verified');
    if (previous) previous.hidden = true;
    byId('auth-title').textContent = 'CRC Potchefstroom';
    byId('auth-copy').textContent = 'Your ministry account';
    let label = byId('moh-live-status');
    if (!label) { label = document.createElement('p'); label.id = 'moh-live-status'; byId('verify').replaceChildren(label); }
    label.textContent = text;
    if (allowSignOut) {
      const btn = document.createElement('button');
      btn.className = 'outline wide'; btn.textContent = 'Sign out';
      btn.onclick = async () => { await signOut(); };
      byId('verify').append(btn);
    }
  };
  const recoveryRedirect = () => location.origin + location.pathname + '?live=1&recovery=1';
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
        proceed.onclick = () => location.replace(location.pathname + '?live=1');
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
  let name = '', last = '', mode = 'signin';
  const state = {vote:null};
  const pages = ['home', 'academy', 'poll', 'profile', 'notifications'];
  const elem = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const button = (text, action, cls) => {
    const control = elem('button', cls, text);
    control.type = 'button';
    control.onclick = action;
    return control;
  };
  function screen(id) {
    ['welcome','auth','app'].forEach(key => { byId(key).hidden = key !== id; });
    byId('jump').hidden = id === 'app';
  }
  function auth(nextMode) {
    mode = nextMode;
    const signup = mode === 'signup';
    const form = byId('login');
    form.hidden = false;
    form.elements.password.value = '';
    form.elements.confirm.value = '';
    form.elements.password.autocomplete = signup ? 'new-password' : 'current-password';
    form.elements.confirm.required = signup;
    byId('confirm-label').hidden = !signup;
    byId('auth-switch').hidden = false;
    byId('verify').hidden = true;
    byId('entry-word').textContent = signup ? 'BELONG.' : 'SERVE.';
    byId('auth-title').textContent = signup ? 'Create your account' : 'Sign in';
    byId('auth-copy').textContent = 'CRC Potchefstroom';
    byId('auth-submit').textContent = signup ? 'Create account' : 'Sign in';
    screen('auth');
  }
  let statusTimer;
  function msg(text) {
    const status = byId('status');
    status.textContent = text;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { status.textContent = ''; }, 3600);
  }
  let previousFocus;
  function setMenu(open, restoreFocus = true) {
    const sidebar = byId('sidebar');
    if (sidebar.hidden === !open) return;
    if (open) previousFocus = document.activeElement;
    sidebar.hidden = !open;
    byId('nav-scrim').hidden = !open;
    byId('open-nav').setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) byId('close-nav').focus();
    else if (restoreFocus) previousFocus?.focus();
  }
  function openModal(title) {
    const modal = byId('details');
    byId('details-title').textContent = title;
    const body = byId('details-body');
    body.replaceChildren();
    if (!modal.open) modal.showModal();
    return body;
  }
  function closeModal() { byId('details').close(); }
  function root57(id) {
    const root = byId(id + '-root');
    root.replaceChildren();
    return root;
  }
  function strip57(root, label, title, note) {
    root.append(elem('p','muted',label),elem('h1','',title),elem('p','muted',note));
  }
  function line57(root, title, text, control) {
    const row = elem('article','panel');
    row.append(elem('h2','',title),elem('p','',text));
    if (control) row.append(control);
    root.append(row);
  }
  function progress57(root, value) {
    const progress = elem('progress');
    progress.max = 100;
    progress.value = value;
    progress.setAttribute('aria-label','Assessment progress');
    root.append(progress);
  }
  function sanitizeDashboard() {
    byId('greeting').textContent = 'Welcome, ' + name + '.';
    byId('member-name').textContent = name + (last ? ' ' + last : '');
    byId('member-group').textContent = member.group_code?.toUpperCase() || 'No serving group assigned';
    byId('member-role').textContent = summary.roles?.map(role=>role.label).filter(Boolean).join(' · ') || 'Member';
    byId('availability-status').textContent = state.vote || 'No availability response recorded for this Sunday.';
    const upcoming = summary.upcoming?.[0];
    byId('service-status').textContent = upcoming
      ? [upcoming.service_date, upcoming.code?.toUpperCase(), upcoming.arrival?.slice(0,5)].filter(Boolean).join(' · ')
      : 'No upcoming service is assigned to your team.';
  }
  function page(id) {
    if (!active || !pages.includes(id)) return;
    setMenu(false, false);
    byId('work-title').textContent = {home:'Dashboard',academy:'Academy',poll:'Sunday availability',notifications:'Alerts',profile:'Profile'}[id];
    window.scrollTo(0,0);
    pages.forEach(key => { byId(key).hidden = key !== id; });
    document.querySelectorAll('#nav [data-page]').forEach(control=>{
      control.setAttribute('aria-current', control.dataset.page === id ? 'page' : 'false');
    });
    if (id === 'home' || id === 'profile') sanitizeDashboard();
    if (id === 'academy') liveAcademy();
    if (id === 'notifications') liveNotifications();
  }
  async function signOut() {
    try {
      check(await client.auth.signOut());
      closeModal();
      location.replace(location.pathname);
    } catch (err) { say(err.message || 'Could not sign out'); }
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
          await loadCourses(); liveAcademy();
        } catch (err) { say(err.message || 'Assessment not saved'); }
        finally { busy = false; submit.disabled = false; }
      };
      box.append(f);
    } catch (err) { say(err.message || 'Assessment unavailable'); }
    finally { busy = false; }
  }
  function liveAcademy() {
    const root = root57('academy');
    const banner = elem('header','academy-hero');
    banner.style.display = 'block';
    banner.style.width = '100%';
    banner.append(elem('p','eyebrow','RED ARMY ACADEMY'),elem('h1','',course?.title || 'Your training'));
    root.append(banner);
    if (!course) {
      banner.append(elem('p','muted','No published course is assigned to your account yet.'));
      return;
    }
    const assessed = units.filter(unit=>unit.question_count>0);
    const passed = assessed.filter(completed).length;
    banner.append(elem('p','',''+passed+' of '+assessed.length+' assessments passed · Pass mark '+course.pass_mark+'%'));
    progress57(banner, assessed.length ? passed / assessed.length * 100 : 0);
    const next = assessed.find(unit=>!unit.is_final&&!completed(unit));
    const final = assessed.find(unit=>unit.is_final&&!completed(unit));
    const current = next || final;
    if (current) {
      const line = elem('article','panel academy-next');
      line.append(elem('p','eyebrow',next?'NEXT LESSON':'FINAL ASSESSMENT'),elem('h2','',current.title),
        button(next?'Continue training':'Open final assessment',()=>lesson(current),'primary'));
      root.append(line);
    }
    root.append(elem('h2','','Course modules'));
    const modules = elem('div','academy-modules');
    units.forEach((unit,index)=>{
      const passedUnit=completed(unit);
      const locked=unit.is_final&&!!next&&!passedUnit;
      const item=button('',()=>lesson(unit),'line57 module57');
      const title=elem('div');
      title.append(elem('b','',unit.title),elem('small','',passedUnit?'Passed':locked?'Complete the knowledge checks to unlock':unit.is_final?'Final assessment':unit.question_count?'Lesson and knowledge check':'Lesson'));
      item.disabled=locked;
      item.append(elem('div','num57',String(index+1).padStart(2,'0')),title);
      if (passedUnit) item.append(elem('span','done57','✓'));
      modules.append(item);
    });
    root.append(modules);
  }
  const sunday = date => {
    const d = date ? new Date(date + 'T12:00:00') : new Date();
    d.setDate(d.getDate() + (7 - d.getDay()) % 7);
    const year = d.getFullYear(), month = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  };
  async function loadVote(date) {
    const rows = check(await client.from('moh16_availability').select('service_code,choice,reason').eq('church_id', CHURCH).eq('user_id', account.id).eq('service_date', date));
    const am = rows?.find(x => x.service_code === 'am')?.choice === 'available';
    const pm = rows?.find(x => x.service_code === 'pm')?.choice === 'available';
    state.vote = am && pm ? 'Both services' : am ? 'AM service' : pm ? 'PM service' : rows?.length ? 'Not serving' : null;
    document.querySelectorAll('#poll-form [name=choice]').forEach(x => { x.checked = x.value === state.vote; });
    byId('reason-label').hidden = state.vote !== 'Not serving';
    byId('poll-form').elements.reason.value = state.vote === 'Not serving' ? rows?.find(row=>row.reason)?.reason || '' : '';
    byId('poll-form').elements.reason.required = state.vote === 'Not serving';
  }
  async function saveVote(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!active || busy) return;
    const f = new FormData(e.target), choice = String(f.get('choice') || '');
    const date = String(f.get('sunday') || sunday());
    const reason = String(f.get('reason') || '').trim();
    if (!['AM service', 'PM service', 'Both services', 'Not serving'].includes(choice)) return say('Choose your serving availability.');
    if (choice === 'Not serving' && !reason) return say('Please provide a reason.');
    if (new Date(date + 'T12:00:00').getDay() !== 0) return say('Select a Sunday.');
    const services = (configuration.services || []).map(x => x.code);
    const actions = ['am', 'pm'].filter(x => services.includes(x));
    if (!actions.length) return say('No Sunday services are configured.');
    busy = true;
    try {
      for (const code of actions) {
        const available = choice === 'Both services' || choice === (code === 'am' ? 'AM service' : 'PM service');
        check(await client.rpc('moh16_submit_availability', {
          p_church: CHURCH, p_service: code, p_date: date,
          p_choice: available ? 'available' : 'not_serving',
          p_reason: available ? '' : (reason || 'Serving the other Sunday service')
        }));
      }
      await loadVote(date);
      say('Your availability has been saved to Supabase.');
      page('home');
      sanitizeDashboard();
    } catch (err) { say('Availability not fully saved: ' + (err.message || 'Please retry')); }
    finally { busy = false; }
  }

  async function liveNotifications() {
    const root = root57('notifications');
    strip57(root, 'MINISTRY ALERTS', 'Notifications', 'Messages assigned to your authenticated account');
    const test = button('Send me a test alert', async () => {
      test.disabled = true;
      try {
        const created = check(await client.rpc('moh16_create_potch_test_notification'));
        say(created ? 'Test alert added to your inbox.' : 'You already created a test alert today.');
        await liveNotifications();
      } catch (err) {
        say(err.message || 'Could not create a test alert');
        test.disabled = false;
      }
    }, 'outline');
    root.append(test);
    try {
      const rows = check(await client.from('moh16_notifications')
        .select('id,title,body,kind,created_at,read_at')
        .eq('church_id', CHURCH).eq('user_id', account.id)
        .order('created_at', { ascending: false }).limit(50)) || [];
      if (!rows.length) {
        root.append(elem('p', 'muted', 'No ministry notifications yet.'));
        return;
      }
      rows.forEach(n => {
        const mark = n.read_at ? null : button('Mark read', async () => {
          try {
            check(await client.rpc('moh16_read_notification', { p_church: CHURCH, p_id: n.id }));
            await liveNotifications();
          } catch (err) { say(err.message || 'Could not mark notification as read'); }
        }, 'outline');
        line57(root, n.title || 'Ministry update', (n.body || '') + ' · ' + new Date(n.created_at).toLocaleDateString('en-ZA') + (n.read_at ? ' · Read' : ' · Unread'), mark);
      });
    } catch (err) { root.append(elem('p', 'muted', 'Notifications could not be loaded: ' + err.message)); }
  }
  function safeProfile() {
    const root = byId('profile');
    if (!root) return;
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
          closeModal(); sanitizeDashboard();
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
      byId('entry-word').textContent = 'BELONG.';
      byId('auth-title').textContent = 'Find your place.';
      const options = elem('fieldset','trainee-options');
      options.append(elem('legend','','Choose your trainee group'));
      for (const [code,title] of [
        ['amuit','AM Usher'],['amhit','AM Hostess'],
        ['pmuit','PM Usher'],['pmhit','PM Hostess']
      ]) {
        const option = elem('input');
        option.type = 'radio';
        option.name = 'trainee-group';
        option.value = code;
        option.required = true;
        const label = elem('label');
        label.append(option,document.createTextNode(title));
        options.append(label);
      }
      const submit = document.createElement('button');
      submit.type = 'submit';
      submit.className = 'primary wide';
      submit.textContent = 'Continue';
      const status = document.createElement('p');
      status.setAttribute('role', 'status');
      form.append(options, submit, status);
      panel.prepend(form);
      form.addEventListener('submit', async event => {
        event.preventDefault();
        submit.disabled = true;
        try {
          check(await client.rpc('moh16_self_register_potch', { p_group: new FormData(form).get('trainee-group') }));
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
    state.vote = null;
    const date = sunday();
    byId('poll-form').elements.sunday.value = date;
    byId('poll-date').textContent = date;
    await Promise.all([loadCourses(), loadVote(date)]);
    active = true;
    screen('app');
    page('home');
    safeProfile();
  }
  async function submitCredentials(e) {
    e.preventDefault(); e.stopImmediatePropagation();
    if (!client || busy) return say('Connection is still loading.');
    const f = e.target, email = String(f.elements.email.value || '').trim(), password = f.elements.password.value;
    busy = true; byId('auth-submit').disabled = true;
    try {
      if (mode === 'signup') {
        if (password !== f.elements.confirm.value) return say('Passwords do not match.');
        const result = check(await client.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname + '?live=1' } }));
        if (result?.session) await enter(result.user);
        else inform('Account created. Confirm your email, then sign in to choose your trainee group and open the Academy.', false);
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
    login.elements.email.value = ''; login.elements.password.value = ''; login.elements.confirm.value = '';
    login.addEventListener('submit', submitCredentials, true);
    document.querySelectorAll('[data-auth]').forEach(control=>{ control.onclick=()=>auth(control.dataset.auth); });
    document.querySelectorAll('[data-page]').forEach(control=>{ control.onclick=()=>page(control.dataset.page); });
    byId('sign-out').onclick = signOut;
    byId('open-nav').onclick = () => setMenu(true);
    byId('close-nav').onclick = () => setMenu(false);
    byId('nav-scrim').onclick = () => setMenu(false);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !byId('sidebar').hidden) setMenu(false);
    });
    byId('back-home').onclick = () => screen(active ? 'app' : 'welcome');
    byId('close-details').onclick = closeModal;
    byId('poll-form').addEventListener('submit', saveVote);
    byId('poll-form').addEventListener('change',()=>{
      const unavailable=byId('poll-form').elements.choice.value === 'Not serving';
      byId('reason-label').hidden=!unavailable;
      byId('poll-form').elements.reason.required=unavailable;
    });
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
      client = mod.createClient(URL, "sb_publishable_k8PRKFpCTvh9qU5q4GOv2Q_coh9uu69", {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
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
          retry.onclick = () => location.replace(location.pathname + '?live=1');
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
