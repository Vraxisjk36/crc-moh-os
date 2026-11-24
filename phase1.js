import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
const db=createClient('https://tkiwlptybfmaduulovbg.supabase.co','sb_publishable_k8PRKFpCTvh9qU5q4GOv2Q_coh9uu69',{auth:{storageKey:'crc-moh-phase1-auth'}});
const $=id=>document.getElementById(id);
const message=(text='')=>{$('message').textContent=text};
function visible(id,yes){$(id).hidden=!yes}
function result(r){if(r.error)throw Error(r.error.message);return r.data}
async function action(fn){message();try{await fn()}catch(e){message(e.message||'Request failed')}}
function fields(form){return Object.fromEntries(new FormData(form))}
function page(id){for(const p of ['home','poll','notifications','activation'])visible(p,p===id)}
function nextSunday(){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const v=t=>parts.find(p=>p.type===t).value;const date=new Date(Date.UTC(+v('year'),+v('month')-1,+v('day')));date.setUTCDate(date.getUTCDate()+(7-date.getUTCDay())%7);return date.toISOString().slice(0,10)}
async function refresh(){
const {data:{session},error}=await db.auth.getSession();if(error)throw Error(error.message);
visible('auth',!session);visible('register',false);visible('app',false);visible('exit-registration',false);if(!session)return;
const profile=result(await db.from('member_profiles').select('user_id,first_name,last_name').eq('user_id',session.user.id).maybeSingle());
if(!profile){const groups=result(await db.from('ministry_groups').select('code,division,service,training').order('code'));$('groups').replaceChildren(new Option('Choose your group',''));for(const g of groups)$('groups').add(new Option(g.code+' — '+(g.training?'Training':'Regular'),g.code));visible('register',true);visible('exit-registration',true);return}
const memberships=result(await db.from('group_memberships').select('group_code').eq('user_id',session.user.id).is('ended_at',null));
const roles=result(await db.from('leadership_roles').select('role,division,service,group_code,starts_at,ends_at,revoked_at').eq('user_id',session.user.id));
const now=Date.now();const active=roles.filter(r=>!r.revoked_at&&Date.parse(r.starts_at)<=now&&(!r.ends_at||Date.parse(r.ends_at)>now));
$('greeting').textContent='Welcome, '+profile.first_name;
$('membership').textContent='Home group: '+(memberships[0]?.group_code||'No current group');
$('roles').textContent='Active leadership roles: '+(active.map(r=>r.role.replaceAll('_',' ')+(r.group_code?' · '+r.group_code:'')).join(', ')||'None');
$('poll-form').elements.sunday.value=nextSunday();visible('app',true);page('home');
}
async function notifications(){const rows=result(await db.from('member_notifications').select('id,title,body,created_at,read_at').order('created_at',{ascending:false}).limit(100));const root=$('notification-list');root.replaceChildren();if(!rows.length)root.textContent='No notifications yet.';for(const n of rows){const article=document.createElement('article');const h=document.createElement('h3');h.textContent=n.title;const p=document.createElement('p');p.textContent=n.body;article.append(h,p);if(!n.read_at){const b=document.createElement('button');b.textContent='Mark as read';b.onclick=()=>action(async()=>{result(await db.rpc('mark_notification_read',{p_id:n.id}));await notifications()});article.append(b)}root.append(article)}}
$('login').onsubmit=e=>{e.preventDefault();action(async()=>{const f=fields(e.target);result(await db.auth.signInWithPassword({email:f.email,password:f.password}));await refresh()})};
$('signup').onclick=()=>action(async()=>{if(!$('login').reportValidity())return;const f=fields($('login'));const r=result(await db.auth.signUp({email:f.email,password:f.password}));if(r.session)await refresh();else message('Check your email to verify your account, then sign in.')});
$('registration').onsubmit=e=>{e.preventDefault();action(async()=>{const f=fields(e.target);result(await db.rpc('register_member',{p_first:f.first,p_last:f.last,p_group:f.group,p_phone:f.phone,p_birth:f.birth||null,p_year:f.year?Number(f.year):null}));await refresh()})};
$('poll-form').onsubmit=e=>{e.preventDefault();action(async()=>{const f=fields(e.target);result(await db.rpc('submit_sunday_poll',{p_sunday:f.sunday,p_choice:f.choice,p_reason:f.reason||null}));message('Availability saved.')})};
$('activation-form').onsubmit=e=>{e.preventDefault();action(async()=>{const f=fields(e.target);result(await db.rpc('redeem_leadership_code',{p_code:f.code.trim()}));e.target.reset();await refresh();message('Leadership role activated.')})};
for(const b of $('nav').querySelectorAll('[data-page]'))b.onclick=()=>action(async()=>{page(b.dataset.page);if(b.dataset.page==='notifications')await notifications()});
for(const id of ['logout','exit-registration'])$(id).onclick=()=>action(async()=>{result(await db.auth.signOut());await refresh()});
action(refresh);
