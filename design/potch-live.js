/* CRC Potchefstroom live-data adapter.
   Staging only: ?live=1. The approved 4 MB master and its demo mode remain intact.
   Security decisions always remain in Supabase (RLS / RPC), never in this UI. */
(function () {
  'use strict';
  if (new URLSearchParams(location.search).get('live') !== '1') return;
  const CHURCH = 'debd20d7-ab61-490e-ab73-1d37b55cb389';
  const URL = 'https://tkiwlptybfmaduulovbg.supabase.co';
  let client, account, member, summary, configuration, course, units = [], attempts = [], active = false;
  let busy = false;
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
    if (allowSignOut) {
      const btn = document.createElement('button');
      btn.className = 'outline wide'; btn.textContent = 'Sign out';
      btn.onclick = async () => { await client.auth.signOut(); account = null; active = false; auth('signin'); };
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
  const routePermissions = () => {
    const grants = (summary.roles || []).flatMap(r => Array.isArray(r.permissions) ? r.permissions : []);
    return new Set(grants);
  };
  const allowed = p => {
    if (!active) return false;
    const perm = routePermissions();
    // Only workflows implemented against real tenant data are enabled here.
    if (['home', 'academy', 'poll', 'profile', 'notifications'].includes(p)) return true;
    if (p === 'reports' && perm.has('reports.read')) return false; // pending real reports UI
    return false;
  };
  function sanitizeDashboard() {
    const root = byId('home');
    if (!root) return;
    const upcoming = (summary.upcoming || [])[0];
    const assignment = byId('assignment-area');
    if (assignment) assignment.textContent = 'Awaiting verified leadership allocation';
    const art = root.querySelector('.assignment-art');
    if (art) {
      const service = art.querySelector('span');
      const time = art.querySelector('b');
      if (service) service.textContent = upcoming?.code?.toUpperCase() || '—';
      if (time) time.textContent = String(upcoming?.arrival || '—').slice(0, 5);
    }
    const history = root.querySelector('.history-summary');
    if (history) {
      history.querySelectorAll('b').forEach(el => el.textContent = '—');
      const note = history.querySelector('.history-note');
      if (note) note.textContent = 'Serving history awaits verified attendance records.';
    }
    const chart = byId('week-chart'), detail = byId('week-detail');
    if (chart) chart.replaceChildren();
    if (detail) detail.replaceChildren();
    let status = byId('moh-live-banner');
    if (!status) {
      status = document.createElement('p');
      status.id = 'moh-live-banner';
      status.className = 'muted';
      root.querySelector('.dash-date')?.append(status);
    }
    status.textContent = 'Connected to CRC Potchefstroom · Live account · Draft campus';
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
    if (state.vote) document.querySelectorAll('#poll-form [name=choice]').forEach(x => { x.checked = x.value === state.vote; });
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
      modal.append(button('Sign out', async () => {
        await client.auth.signOut();
        active = false; account = null;
        closeModal(); location.reload();
      }, 'outline wide'));
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
    await Promise.all([loadCourses(), loadVote(sunday())]);
    dashboard();
    sanitizeDashboard();
    renderAcademy57 = liveAcademy;
    const originalPage = page;
    page = function (p) {
      if (!allowed(p)) { say('This ministry workspace is not yet connected in live staging.'); return; }
      originalPage(p);
      if (p === 'home') sanitizeDashboard();
      if (p === 'academy') liveAcademy();
      if (p === 'notifications') liveNotifications();
      if (p === 'profile') safeProfile();
    };
    const nav = document.querySelectorAll('#nav [data-page],.bottom-tabs [data-page]');
    nav.forEach(b => { if (!allowed(b.dataset.page)) b.title = 'Live integration pending'; });
    byId('poll-form').addEventListener('submit', saveVote, true);
    byId('app').querySelectorAll('[data-home]').forEach(b => b.addEventListener('click', async e => {
      e.preventDefault(); e.stopImmediatePropagation();
      await client.auth.signOut(); active = false; account = null; screen('welcome');
    }, true));
    safeProfile();
    say('Connected to your CRC Potchefstroom account.');
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
