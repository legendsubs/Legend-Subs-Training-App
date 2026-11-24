/* ==================================================================
   Legend Subs Training Tracker — Code.gs  (v13: simple weekly email, Phase 2 is a bonus for shift leaders)
   Bound to the master Google Sheet (Extensions > Apps Script).
   ================================================================== */

const SH = { STORES: 'Stores', USERS: 'Users', TASKS: 'Tasks', EMP: 'Employees', PROG: 'Progress', POF: 'POFs', SET: 'Settings' };
const LEVELS = ['Phase 1', 'Phase 3', 'Phase 2', 'MIT', 'ServSafe'];   // display and certification order
const SEQUENTIAL_LEVELS = ['MIT'];     // sections must be finished in order
const POSITIONS = ['Crew Member', 'Shift Leader'];
const MIT_STATES = ['', 'Enrolled', 'Graduated'];
const SESSION_SECONDS = 6 * 60 * 60;   // how long a login lasts
const NEW_HIRE_DAYS = 30;              // "new hire" window for the report
const STALL_DAYS = 14;                 // no check-offs in this many days = stalled
const STALL_MIN_TENURE = 21;           // only flag stalls after 3 weeks on the job
const DAY = 864e5;

const HEADERS = {
  Stores: ['Store #', 'Name', 'Market'],
  Users: ['Name', 'Email', 'Role', 'Stores', 'PIN', 'Active'],
  Tasks: ['Level', 'Section', 'Task', 'Order', 'Under-18 restricted'],
  Employees: ['Employee ID', 'Store #', 'Name', 'Date of birth', 'Start date', 'Position', 'Status', 'MIT program', 'Notes', 'Added'],
  Progress: ['Employee ID', 'Level', 'Section', 'Task', 'Done', 'Updated by', 'Updated at'],
  POFs: ['POF ID', 'Employee ID', 'Position', 'Date', 'Trainer', 'Score %', 'Answers (y/n per item)', 'Comments', 'Recorded by', 'Recorded at'],
  Settings: ['Setting', 'Value']
};

const DEFAULT_STORES = [
  ['37003', 'Exeter', 'North'], ['37011', 'Portsmouth', 'North'], ['37015', 'Epping', 'North'],
  ['37018', 'Rochester', 'North'], ['37023', 'Durham', 'North'],
  ['16033', 'Methuen', 'South'], ['16059', 'Chelmsford', 'South'], ['37005', 'Seabrook', 'South'],
  ['37008', 'Londonderry', 'South'], ['16072', 'Westford', 'South']
];

// Role: admin (all stores), dm (their market), manager (their store). Fill blanks before locking PINs.
const DEFAULT_USERS = [
  ['Crowley', 'crowley@legend-subs.com', 'admin', 'ALL', '', true],
  ['Owner', '', 'admin', 'ALL', '', true],
  ['Jake Lunger', 'jlungerlegendsubs@gmail.com', 'dm', '37003, 37011, 37015, 37018, 37023', '', true],
  ['Adam Stanneck', 'adamstanneck24@gmail.com', 'dm', '16033, 16059, 37005, 37008, 16072', '', true],
  ['Josh Buckley', 'jbuckleylegendsubs@gmail.com', 'manager', '37018', '', true],
  ['Rudy Schnare', 'rudyschnarelegendsubs@gmail.com', 'manager', '37023', '', true],
  ['Gerrie De Wet', '', 'manager', '37008', '', true],
  ['Zack Nadeau', '', 'manager', '16072', '', true],
  ['Kayden', '', 'manager', '37003', '', true]
];

const DEFAULT_SETTINGS = [
  ['Weekly email recipients', 'crowley@legend-subs.com, jlungerlegendsubs@gmail.com, adamstanneck24@gmail.com'],
  ['Weekly email day', 'Monday'],
  ['Weekly email hour (0-23)', '7'],
  ['App link', ''],
  ['Phase 1 station order', 'Readiness, Sprinkling, Wrapping, Cashier, Grill, Opening / prep, Food safety, Slicing, General management'],
  ['Phase 3 station order', 'Readiness, Bookkeeping, Ordering and inventory, Schedule, Profit and loss, Advanced management']
];

/* Checklists from the Existing Team Member Pre-Evaluation Form.
   Sections listed in RESTRICTED_SECTIONS, and tasks in RESTRICTED_TASKS, are marked under-18 restricted
   (federal rules bar minors from operating or cleaning power-driven meat slicers). */
const RESTRICTED_SECTIONS = ['Slicing'];
const RESTRICTED_TASKS = ['Sharpening the slicer'];

const CHECKLISTS = {
  'Phase 1': [
    ['Readiness', [
      'In proper uniform and meeting hygiene standards',
      'LMS: 75% sequential completion of the training track (through Shift Lead – Closing & Opening)'
    ]],
    ['Slicing', [
      'Greeting the customer', 'Communicates with the customer – solid banter and engagement', 'Smiling',
      'Communicates with the team – the sub and who it\'s for', 'Safety', 'Posture', 'Bread cutting',
      'Lids placed next to sprinkling board', 'Loading and unloading correctly / safety', 'Meat case door shut each time',
      'Proper cheese thickness (5 provolone = 2 oz)', 'Proper meat thickness (3 ham = 1.8 oz)', 'Catch and flip',
      'Building up, not out', 'Pile high', 'Equal distribution', 'Passing subs by the ends',
      'Slicing 2–3 subs at a time, line moving', 'Ticket writing', 'Eyes up, 360° vision, slicer watches all',
      'Speed – slices a lunch rush with urgency', 'Cleans the slicer often enough',
      'Sharpening / oiling / assembling / disassembling the slicer', 'Able to teach / coach slicing',
      'Slice weights: 5 subs, none under ideal and no more than 0.50 oz over'
    ]],
    ['Sprinkling', [
      'Communicates with the customer, controls the conversation', 'Communicates with the team down the line',
      'Polite and engaged, head / eyes up', 'Smiling', 'Sub moved all the way down the board', 'Asks "Mike\'s Way" as needed',
      'Sub not moved after sprinkling begins', 'Onions – amount, technique, distribution',
      'Lettuce – amount, technique, pyramided, distribution', 'Tomatoes – amount, technique, distribution',
      'Sweeps board before juice', 'Vinegar – amount, technique, distribution', 'Oil – amount, technique, distribution',
      'Oregano – amount, technique, distribution', 'Salt – amount, technique, distribution',
      'Extras – amount, technique, distribution', 'Bacon and mayo on clubs, correct amount', 'Gently places lids on subs',
      'Picks up subs by the ends, no sliding', 'Keeps area clean and stocked', 'Speed – sprinkles a lunch rush with urgency',
      'Hits 2 rows for 2 oz consistently (8 of 10)', 'Able to teach / coach sprinkling'
    ]],
    ['Wrapping', [
      'Communicates with the customer, good banter', 'Communicates with the team down the line', 'Eyes up', 'Smiling',
      'Paper pulled correctly at proper length', 'Paper placement, one sheet at a time', 'Sub picked up by the ends',
      'Sub placed in center of paper', 'Sub cut properly, cupped hand, knife in safe place', 'Proper pullback', 'Quarter turn',
      'Ends wrapped tight, no "wings"', 'Hand-over-hand roll, no folds or thumbs', 'Finished wrap neat and tight, sub facing correctly',
      'Sub bag popped properly', 'Sub bag creased properly', 'Communicates to cashier, writes # on sub bags',
      'Up-sells and assists cashier', 'Assists sprinkler, cleaning, stocking', 'Packages digital orders properly',
      'Speed – wraps a lunch rush with urgency', 'Able to teach / coach wrapping'
    ]],
    ['Grill', [
      'Bread cut properly', 'Bread tempered properly', 'Proper portioning of veggies', 'Order of operations – steak down last',
      'Salts steak after flipping', 'Proper technique and chop amount', 'Holds utensils properly', 'Beef Philly – proper procedure',
      'Chicken Philly – proper procedure','Knows the difference between cheesesteaks',
      'Even distribution on hot subs', 'All subs wrapped in proper paper', 'Hot subs wrapped loosely',
      'No more than three subs at a time', 'Scrapes grill between subs as needed', 'Speed – grills a lunch rush with urgency',
      'Able to teach / coach grill'
    ]],
    ['Cashier', [
      'Communicates with the customer', 'Communicates with the team', 'Eyes up', 'Smiling', 'Knows register functions and components',
      'Rings in sales correctly', 'Rings in discounts and coupons', 'Handles refunds, voids, and cancels',
      'Money handling habits – no gloves, washes hands', 'Activates and loads gift cards', 'Uses Shore Points program',
      'Uses CFT correctly', 'Knows money handling do\'s and don\'ts', 'Speed – runs the register through a lunch rush',
      'Genuinely thanks the customer'
    ]],
    ['Opening / prep', [
      'Bread – panning / thawing', 'Bread – proofing / baking', 'Bread – cooling / storing', 'Baking cookies', 'Onions – slicing',
      'Lettuce – slicing', 'Sharpening the slicer', 'Tomatoes – slicing', 'Slicing green peppers', 'Cooking bacon',
      'Steaks thawed correctly', 'Opening meats and cheeses', 'Setting up the meat case', 'Setting up the front counter',
      'Setting up the digital line – meat cooler, drop-in, packaging', 'Setting up the grill area', 'Onions – peeling',
      'Lettuce – bopping', 'Tomatoes – sorting', 'Washing vegetables', 'Portabella mushrooms prepped and portioned',
      'Prepares tuna', 'Prepares chicken salad', 'Completes opening checklist with urgency'
    ]],
    ['Food safety', [
      'Follows Board of Health food handling procedures', 'Reheats and holds food properly', 'Restaurant / equipment safety',
      'Hand washing / personal hygiene', 'Proper use of gloves', 'Dish washing and sanitation', 'ServSafe certified'
    ]],
    ['General management', [
      'Customer service – eye contact, banter', 'Order taking – phone orders', 'Order taking – catering',
      'Proficient with opening, afternoon, closing, and manager\'s checklists', 'Leads employees and runs a shift',
      'Leads by example, hands-on', 'Daily Bread Tracking Sheet, Production Pro Chart, and Production Report',
      'Completes closing paperwork', 'Prepares bank deposits', 'Daily bread report / reconciliation'
    ]]
  ],
  'Phase 3': [
    ['Readiness', [
      'In proper uniform and meeting hygiene standards', 'LMS: 100% completion of the training track'
    ]],
    ['Bookkeeping', [
      'Daily cash report / reconciliation', 'Daily bread report / reconciliation', 'Monthly profit and loss statement', 'General bookkeeping'
    ]],
    ['Ordering and inventory', [
      'Ordering and receiving from suppliers', 'Storage and rotation of deliveries (FIFO)', 'Establishing par levels',
      'Tracking product usage (Production Pro Chart)', 'Rotation of meat case display', 'Orders through CrunchTime',
      'Conducts inventory in CrunchTime', 'Reviews and troubleshoots CrunchTime inventory',
      'Reads and implements CrunchTime inventory results', 'Uses the Online Flavor Portal'
    ]],
    ['Schedule', [
      'Understands how to schedule', 'Has worked on and hit labor % goal', 'Has conducted an employee interview',
      'Set up an employee file', 'Understands the schedule tool', 'Uses the schedule tool'
    ]],
    ['Profit and loss', [
      'Understands food and paper costs', 'Understands labor costs', 'Reads a P&L'
    ]],
    ['Advanced management', [
      'Uses the Lead Time Manager', 'Employee training (teaches the Golden Bottle)', 'Employee supervision (checklist completion)',
      'Has read and understands the Local Store Marketing Manual'
    ]]
  ],
  // Phase 2 is the in-person class at corporate; it is completed after Phase 3.
  'Phase 2': [
    ['Corporate class', [
      'Attended the in-person class at corporate'
    ]]
  ],
  // From "Legend Subs – Manager in Training Program" (Adam's checkpoint draft). Each checkpoint must be 100% before the next opens.
  'MIT': [
    ['Pre-MIT requirements', [
      'Passed all POFs (95% or higher)', 'Phase 1 and Phase 3 certified', 'Able to open and close', 'Open availability'
    ]],
    ['Checkpoint 1 – Leadership and operations excellence', [
      'Runs the store day to day without manager oversight', 'Delegates confidently, runs the store without doing everything themselves',
      'Trains and coaches in the moment', 'Understands prep levels and why', 'Runs efficient shifts', 'Leads catering organization',
      'Weekly review #1 completed'
    ]],
    ['Checkpoint 2 – Understand the numbers', [
      'Understands labor and food cost and how to act when they need improvement', 'Understands the P&L',
      'Takes control of all ordering and invoices', 'Knows all online platforms (Flexepos, BTC, CrunchTime, Fivekids, Pepsi)',
      'Harri deep dive (scavenger hunt)', 'Knows who to contact for each type of issue', 'Leads all weekly and monthly inventories',
      'Weekly review #2 completed'
    ]],
    ['Checkpoint 3 – Fine details and culture', [
      'Controls food waste (prep levels, waste, overportioning)', 'Understands all POFs', 'Understands grassrooting',
      'Community involvement – seeks fundraisers and catering', 'Understands the optics of a manager (where it\'s busy, brings the energy, face of the store)',
      'Keeps moving the needle on efficiency and training quality', 'Weekly review #3 completed'
    ]],
    ['Checkpoint 4 – Leadership and operations part 2', [
      'Handles all scheduling and forecasting', 'Holds crew accountable (tardiness, callouts, in-store issues)',
      'Higher-level training (Phase 1 and Phase 3)', 'Leadership training with shift leads (delegation and training)',
      'Leads weekly training plan and shift notes', 'Weekly review #4 completed'
    ]],
    ['Checkpoint 5 – Acting manager', [
      'Delegates and trains upper-level tasks (ordering, inventory)', 'Conducts all interviews', 'Zenput oversight',
      'Comment cards', 'Food cost focus', 'Trains the trainers', 'Bank runs', 'Weekly review #5 completed'
    ]],
    ['Graduation', [
      'Oversight team sign-off (District Manager + Store Manager)'
    ]]
  ]
};

/* Position Observation Forms, in the order positions are learned. Each POF is saved as its own dated record,
   so repeat POFs are kept. A POF passes at POF_PASS percent or higher. */
const POF_PASS = 95;
const POF_RESTRICTED = ['Slicer'];   // under-18 employees can't be observed on the slicer
const POF_ORDER = ['Sprinkler', 'Wrapper', 'Cashier', 'Grill', 'Slicer'];
const POF_FORMS = {
  'Sprinkler': [
    ['People', ['Help teammates throughout shift', 'Ask for help when needed', 'Share group tasks (sweeping, cleaning counters, stocking, etc.)']],
    ['Product', ['10 times in a row gets 1oz of oil vin on a regular and 2oz on a Giant using pans', 'Subs placed on cutting board in front of onions',
      'Ingredients placed on sub starting on the end closest to the customer', 'Ingredients are equally distributed end to end and no bunching',
      'Hold golden bottles 2" over the sub, 2 passes for vinegar, and 3 passes for oil', 'Oregano equal distribution and complete 2 rows per sandwich',
      'Salt 1 row per sandwich except the #6 which gets 2', 'Extras go on the sub after Mike\'s Way items are complete', 'Remember mayo and bacon on #8 and #9',
      'Never push lid down, pick up subs by ends, place subs in middle of paper, corner to corner', 'Ensures food safety (proper use of gloves and sanitized towels)']],
    ['Environment', ['Adhered to uniform and hygiene policy', 'What time is it? 9:59, keep area clean and stocked throughout shift',
      'Clean the cutting board in between every sub', 'Keep sub tops off cutting board and to the side closest to the wrap station',
      'Move online tickets to side of cutting board closest to wrap station so the wrapper can help with extras and bacon']],
    ['Great Service', ['Smiles, polite, and engaged with customers. Head / eyes up when possible', 'Asks customers if they want it Mike\'s Way and about mayo / bacon on clubs',
      'Able to effectively communicate down the line with team', 'Put on a show! Friendliness, banter, speed, product knowledge, and juice skills',
      'Speed (moves with sense of urgency during a rush)', 'Puts live customers first, but balances time to not fall behind with online orders']],
    ['Cost Balancing', ['Proper amount of lettuce: 4oz souffle cup, 5 for Giant, 3 for Regular, 2 for Mini', 'Proper amount of tomatoes: 5 for Giant, 3 for Regular, 2 for Mini',
      'Bacon: 1 for Mini, 2 for Regular, 4 for Giant. BLT: 4 Mini, 6 Regular, 12 Giant', 'Cutting board swept before juice and excess ingredients returned to pans']]
  ],
  'Wrapper': [
    ['People', ['Help teammates throughout shift', 'Ask for help when needed', 'Share group tasks (sweeping, cleaning counters, stocking, etc.)',
      'Help sprinkler with mayo, bacon, and CPR when able to']],
    ['Product', ['Tear paper clean and fast at proper length', 'Place paper on counter logo down and only one piece at a time', 'Place sub in the middle of the paper corner to corner',
      'Cut quickly and safely, do not cut paper, Minis & Regulars in 1/2, Giants in 1/4s', 'Proper wrapping technique, pull sub tight, quarter turn before tuck, don\'t crush sub, no wings on ends',
      'Crease bag properly and tight', 'Minis and Regulars twist excess bag tightly to secure sub', 'Mark every sub neatly and clearly with sharpie',
      'Ensures food safety (proper use of gloves and sanitized towels)']],
    ['Environment', ['Adhered to uniform and hygiene policy', 'Keep counter area clean, free of cornmeal and debris', 'Wipe the knife clean when necessary, clean and sanitize every 4 hours',
      'Always put knife back into area next to sub bags to prevent accidents', 'Keep sub bags and sub wrap stocked, especially going into a rush',
      'Move online tickets next to subs as they are completed to help keep orders organized']],
    ['Great Service', ['Smiles, polite, and engaged with customers. Head / eyes up when possible', 'Able to effectively communicate down the line with team',
      'Put on a show! Friendliness, banter, speed, and product knowledge go a long way', 'Bag Pop! Make noise and again put on a show', 'Speed (moves with sense of urgency during a rush)']],
    ['Cost Balancing', ['Paper pulled correctly and at proper length (12" Mini, 15" Regular, 21" Giant)', 'Cut subs in a safe manner, all 5 fingers over the blade of the knife',
      'Politely ask customers "eat in or takeout?" (if eat in, no bag is needed)']]
  ],
  'Cashier': [
    ['People', ['Help teammates throughout shift', 'Ask for help when needed', 'Share group tasks (sweeping, cleaning counters, stocking, etc.)',
      'Help wrapper / back line with packing online orders when able to']],
    ['Product', ['Never ask a customer what was in their order, be listening down the line for orders as they come down',
      'Educate our customers about Shore Points and current charity events happening in the store', 'Knows how to ring in sales correctly (proper sub size, extras, drinks / chips)',
      'Shows knowledge of how to handle discounts and coupons', 'Knows how to use Shore Points program', 'Knows how to activate, load, and accept gift cards',
      'UPSELL drinks, chips, cookies and brownies!', 'Ensures food safety (proper use of gloves and money handling)']],
    ['Environment', ['Adhered to uniform and hygiene policy', 'Keep counter area clean, free of cornmeal and debris', 'Keep pens, markers, cups, cookies, brownies, and gift cards stocked',
      'Keep POS screens clean', 'Keep counter area organized to avoid giving customers incorrect orders']],
    ['Great Service', ['Smiles, polite, and engaged with customers. Head / eyes up when possible', 'Able to effectively communicate down the line with team',
      'Put on a show! Friendliness, banter, speed, and product knowledge go a long way to impress customers', 'Speed (moves with sense of urgency during a rush)',
      '360 vision (keep an eye out for customers waiting for pickup orders)']],
    ['Cost Balancing', ['Listen / ask wrapper about extras like bacon, extra cheese / meat',
      'Use correct cash procedures (hand customer change first then bills, place cash on drawer until change is given)']]
  ],
  'Grill': [
    ['People', ['Help teammates throughout shift', 'Must ask for help when needed, don\'t fall behind', 'Share group tasks (sweeping, cleaning counters, stocking, etc.)']],
    ['Product', ['Follow order of operations (prepare bread, tear paper, layout cheese, & protein put down on grill last)',
      'Always start cutting bread at butt end, do not cut all the way through, make a hinge using rounded edge of knife',
      'Peppers placed on top of onions (except on 64, fresh peppers under onions)', 'Salt steak when flipped, never salt chicken', 'Temper bread on grill for at least 30 seconds',
      'Break protein 8 times, place veg on top, break 8 more times', '3 slices of cheese per regular, Big Kahuna gets 4, 64 gets 5 Swiss',
      'Knowledge of menu items and their ingredients (quiz crew member on menu)',
      'Proper wrapping procedures, hot subs wrapped loosely, open end facing wrapper (must be certified on wrapping before grill)',
      'Ensures food safety (proper use of gloves and sanitized towels)']],
    ['Environment', ['Adhered to uniform and hygiene policy', 'Scrape and clean grill as often as possible, especially after #44s', 'Keep counter area clean, free of cornmeal and debris',
      'Keep utensils clean and use correct color for correct subs', 'Keep ingredients stocked between rushes',
      'Move tickets next to subs as they are completed to help keep orders organized for anyone assisting with wrapping']],
    ['Great Service', ['Smiles, polite, and engaged with customers. Head / eyes up when possible', 'Able to effectively communicate down the line with team',
      'Don\'t be afraid to take on multiple orders when possible to improve efficiency', 'Put on a show! Bring sandwiches out to dining room for live orders',
      'Speed (moves with sense of urgency during a rush)', 'Puts live customers first, but balances time to not fall behind with online orders']],
    ['Cost Balancing', ['Proper portioning of veggies (1.25oz onions and .75oz peppers for regular)', 'Grill cooler doors closed when not in use',
      'Use day old bread first before going into new product']]
  ],
  'Slicer': [
    ['People', ['Help teammates throughout shift', 'Ask for help when needed', 'Share group tasks (sweeping, cleaning counters, stocking, etc.)',
      'Be the Quarterback, set the pace, communicate to grill and lead the production line']],
    ['Product', ['Always start cutting bread at butt end, place lids next to sprinkling board', 'Don\'t put pressure on guard, let the slicer do the work',
      'Thickness check: 5 slices of Prov = 2oz, 8 slices of Ham = 4.75oz', 'Catch product on 4 fingers and flip on to the bread, flour the meats',
      'Equal distribution, cover entire sub evenly from end to end', 'Pile meats high, cover the bread but not hanging off sides, build the sub up, not out',
      'Ensures food safety (proper use of gloves and sanitized towels)']],
    ['Environment', ['Adhered to uniform and hygiene policy', 'Wipe down slicer in between every sub / as often as possible during a rush',
      'Always wipe down after roast beef and before #14', 'Keep counter area clean, free of cornmeal and slicer debris',
      'Move completed sandwiches as close to cutting board as possible', 'Move online tickets next to subs as they are completed to help keep orders organized']],
    ['Great Service', ['Smiles, polite, and engaged with customers. Head / eyes up when possible', 'Able to effectively communicate down the line with team',
      'Don\'t be afraid to take on multiple orders when possible to improve efficiency', 'Put on a show! Friendliness, banter, speed, and product knowledge go a long way',
      'Speed (moves with sense of urgency during a rush)', 'Follow correct procedures for writing tickets for hot subs',
      'Puts live customers first, but balances time to not fall behind with online orders']],
    ['Cost Balancing', ['Safety: guard used when possible, turn off by closing the blade when not in use', 'Meat case door is shut each time a product is taken / put back',
      'Check slice weights of 5 subs. Can\'t be less than actual weight and no more than .5 oz over']]
  ]
};
function pofItemCount_(position) { return POF_FORMS[position].reduce((a, s) => a + s[1].length, 0); }

function DEFAULT_TASKS_() {
  const out = [];
  Object.keys(CHECKLISTS).forEach(level => {
    let order = 0;
    CHECKLISTS[level].forEach(([section, tasks]) => tasks.forEach(t => {
      out.push([level, section, t, ++order, RESTRICTED_SECTIONS.indexOf(section) > -1 || RESTRICTED_TASKS.indexOf(t) > -1]);
    }));
  });
  return out;
}

/* ---------------- Sheet menu & web app entry ---------------- */

function onOpen() {
  try {
    SpreadsheetApp.getUi().createMenu('Training App')
      .addItem('1. Set up sheets', 'setup')
      .addItem('2. Lock in PINs', 'hashPins')
      .addItem('3. Turn on weekly email', 'installWeeklyTrigger')
      .addSeparator()
      .addItem('Send weekly email now', 'sendWeeklyReport')
      .addItem('Tidy up the Progress tab', 'compactProgress')
      .addItem('Clear login lockouts', 'clearLockouts')
      .addToUi();
  } catch (e) { Logger.log('onOpen only adds the menu when the sheet opens. Pick "setup" in the dropdown instead.'); }
}

// Shows a pop-up when run from the sheet's menu; writes to the Execution log when run from the editor.
function alert_(msg) {
  try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); }
}

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('Legend Subs Training')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/* ---------------- Helpers ---------------- */

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function sheet_(name) {
  const s = ss_().getSheetByName(name);
  if (!s) throw new Error('Missing sheet "' + name + '". Run Training App > Set up sheets.');
  return s;
}

/* Speed: each tab is read at most once per request (MEMO_), slow-changing tabs are cached for a few minutes,
   and the summary screens are cached until the next save (see bump_ and cached_). */
let MEMO_ = {};
function rows_(name) {
  if (MEMO_[name]) return MEMO_[name];
  const s = sheet_(name), n = s.getLastRow();
  return MEMO_[name] = n < 2 ? [] : s.getRange(2, 1, n - 1, HEADERS[name].length).getValues();
}
function append_(name, rows) {
  if (!rows.length) return;
  const s = sheet_(name);
  s.getRange(s.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  delete MEMO_[name];
}
// Reads a small tab (Users, Stores, Tasks, Settings) from the cache when possible. Hand edits show up within a few minutes.
function cachedRows_(name, seconds) {
  if (MEMO_[name]) return MEMO_[name];
  const c = CacheService.getScriptCache(), k = 'tab:' + name;
  try { const hit = c.get(k); if (hit) return MEMO_[name] = JSON.parse(hit); } catch (e) {}
  const v = rows_(name);
  try { const j = JSON.stringify(v); if (j.length < 90000) c.put(k, j, seconds || 120); } catch (e) {}
  return v;
}
// Data version: changes after every save, so cached summaries are never out of date.
function ver_() { return CacheService.getScriptCache().get('ver') || '0'; }
function bump_() { CacheService.getScriptCache().put('ver', String(Date.now()), 21600); }
function cached_(name, parts, fn) {
  const c = CacheService.getScriptCache(), k = 'sum:' + name + ':' + ver_() + ':' + parts;
  try { const hit = c.get(k); if (hit) return JSON.parse(hit); } catch (e) {}
  const v = fn();
  try { const j = JSON.stringify(v); if (j.length < 95000) c.put(k, j, 600); } catch (e) {}
  return v;
}
// Finds one row by its ID in column A without reading the whole tab. Returns { row, values } or null.
function findRow_(name, id) {
  const s = sheet_(name), n = s.getLastRow(); if (n < 2) return null;
  const hit = s.getRange(2, 1, n - 1, 1).createTextFinder(String(id)).matchEntireCell(true).findNext();
  return hit ? { row: hit.getRow(), values: s.getRange(hit.getRow(), 1, 1, HEADERS[name].length).getValues()[0] } : null;
}

function clean_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }
function norm_(v) { return clean_(v).toLowerCase(); }
function key_(level, section, task) { return norm_(level) + '::' + norm_(section) + '::' + norm_(task); }
function bool_(v) { return v === true || v === 1 || ['true', 'yes', 'y', 'x'].indexOf(norm_(v)) > -1; }
function tz_() { return ss_().getSpreadsheetTimeZone(); }
function ymd_(v) {
  if (!v) return '';
  if (v instanceof Date) return Utilities.formatDate(v, tz_(), 'yyyy-MM-dd');
  const s = clean_(v);
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d) ? '' : Utilities.formatDate(d, tz_(), 'yyyy-MM-dd');
}
function parseYmd_(s) { if (!s) return null; const p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function age_(dob, today) {
  const b = parseYmd_(dob); if (!b) return null;
  let a = today.getFullYear() - b.getFullYear();
  const m = today.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) a--;
  return a;
}
function setting_(k) { const r = cachedRows_(SH.SET, 120).find(r => norm_(r[0]) === norm_(k)); return r ? clean_(r[1]) : ''; }
function esc_(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function pct_(done, total) { return total ? Math.round(100 * done / total) : 100; }

/* ---------------- Setup ---------------- */

function setup() {
  const book = ss_();
  Object.keys(HEADERS).forEach(name => {
    let s = book.getSheetByName(name) || book.insertSheet(name);
    if (s.getLastRow() === 0) {
      s.getRange(1, 1, 1, HEADERS[name].length).setValues([HEADERS[name]]).setFontWeight('bold');
      s.setFrozenRows(1);
    }
  });
  sheet_(SH.STORES).getRange('A:A').setNumberFormat('@');
  sheet_(SH.USERS).getRange('D:E').setNumberFormat('@');
  sheet_(SH.EMP).getRange('B:B').setNumberFormat('@');
  sheet_(SH.EMP).getRange('D:E').setNumberFormat('@');
  sheet_(SH.POF).getRange('D:D').setNumberFormat('@');
  sheet_(SH.POF).getRange('G:G').setNumberFormat('@');

  const seed = (name, data) => { if (sheet_(name).getLastRow() < 2) append_(name, data); };
  seed(SH.STORES, DEFAULT_STORES);
  seed(SH.USERS, DEFAULT_USERS);
  seed(SH.TASKS, DEFAULT_TASKS_());
  seed(SH.SET, DEFAULT_SETTINGS);

  const s1 = book.getSheetByName('Sheet1');
  if (s1 && s1.getLastRow() === 0 && book.getSheets().length > 1) book.deleteSheet(s1);
  salt_();
  alert_('Sheets are ready. Tabs: ' + book.getSheets().map(s => s.getName()).join(', ') +
    '\n\nNext: on the Users tab, fill in missing emails and type a 4–8 digit PIN for each person, then run "2. Lock in PINs".');
}

/* ---------------- PINs & sessions ---------------- */

function salt_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('PIN_SALT');
  if (!s) { s = Utilities.getUuid(); p.setProperty('PIN_SALT', s); }
  return s;
}
function hashPin_(pin) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + clean_(pin));
  return 'h:' + Utilities.base64Encode(bytes);
}

function hashPins() {
  const s = sheet_(SH.USERS);
  let n = 0; const bad = [];
  rows_(SH.USERS).forEach((r, i) => {
    const pin = clean_(r[4]);
    if (!pin || pin.indexOf('h:') === 0) return;
    if (!/^\d{4,8}$/.test(pin)) { bad.push(clean_(r[0]) || 'row ' + (i + 2)); return; }
    s.getRange(i + 2, 5).setValue(hashPin_(pin)); n++;
  });
  alert_(n + ' PIN(s) locked in. Write them down before you leave this screen; they can\'t be read back.' +
    (bad.length ? '\n\nPINs must be 4–8 digits. Fix these and run it again: ' + bad.join(', ') : ''));
}

function findUser_(email, fresh) {
  const r = (fresh ? rows_(SH.USERS) : cachedRows_(SH.USERS, 60)).find(r => norm_(r[1]) === email && bool_(r[5]));
  if (!r) return null;
  const all = allStoreIds_();
  const raw = clean_(r[3]);
  const stores = norm_(raw) === 'all' ? all : raw.split(/[,\s]+/).filter(id => all.indexOf(id) > -1);
  return { name: clean_(r[0]), email: email, role: norm_(r[2]), stores: stores, pinHash: clean_(r[4]) };
}
function allStoreIds_() { return cachedRows_(SH.STORES, 300).map(r => clean_(r[0])).filter(Boolean); }

function login(email, pin) {
  email = norm_(email);
  const cache = CacheService.getScriptCache();
  const fk = 'fail:' + email;
  const fails = Number(cache.get(fk) || 0);
  if (fails >= 5) throw new Error('Too many tries. Wait 15 minutes and try again.');
  const u = findUser_(email, true);   // always read fresh so a new PIN works right away
  if (!u || !u.pinHash || u.pinHash !== hashPin_(pin)) {
    cache.put(fk, String(fails + 1), 900);
    throw new Error('That email and PIN don\'t match. Check both and try again.');
  }
  cache.remove(fk);
  const token = Utilities.getUuid();
  cache.put('tok:' + token, email, SESSION_SECONDS);
  log_(u, 'Signed in', '', ''); try { cache.put('seen:' + email, '1', LOG_VISIT_GAP); } catch (err) {}
  return { token: token, data: bootstrap_(u) };
}
function resume(token) { const u = auth_(token); logVisit_(u); return bootstrap_(u); }
function logout(token) { CacheService.getScriptCache().remove('tok:' + token); return true; }

function auth_(token) {
  const email = token && CacheService.getScriptCache().get('tok:' + token);
  const u = email && findUser_(email);
  if (!u) throw new Error('SESSION_EXPIRED');
  return u;
}
// Inactive (on leave, seasonal) and Former employees are both left out of active counts.
function isOff_(status) { return status === 'Inactive' || status === 'Former'; }
function canSee_(u, storeId) {
  if (u.stores.indexOf(clean_(storeId)) === -1) throw new Error('You don\'t have access to that store.');
}

/* ---------------- Data reads ---------------- */

function getLevels_() {
  if (MEMO_.levels) return MEMO_.levels;
  const tasks = cachedRows_(SH.TASKS, 300).filter(r => clean_(r[0]) && clean_(r[2])).map(r => ({
    level: LEVELS.find(L => norm_(L) === norm_(r[0])) || clean_(r[0]),
    section: clean_(r[1]) || 'General', name: clean_(r[2]), order: Number(r[3]) || 999, restricted: bool_(r[4])
  }));
  const names = LEVELS.slice();
  tasks.forEach(t => { if (names.indexOf(t.level) === -1) names.push(t.level); });
  return MEMO_.levels = names.map(n => {
    const lv = tasks.filter(t => t.level === n).sort((a, b) => a.order - b.order);
    // Station order comes from the Settings tab row "<Level> station order", e.g. "Phase 1 station order".
    const wanted = setting_(n + ' station order').split(',').map(norm_).filter(Boolean);
    const rank = sec => { const i = wanted.indexOf(norm_(sec)); return i === -1 ? 999 : i; };
    const firstSeen = [];
    lv.forEach(t => { if (firstSeen.indexOf(t.section) === -1) firstSeen.push(t.section); });
    const sections = firstSeen.slice().sort((a, b) => rank(a) - rank(b) || firstSeen.indexOf(a) - firstSeen.indexOf(b));
    return {
      name: n,
      tasks: sections.reduce((out, sec) => out.concat(lv.filter(t => t.section === sec)), [])
        .map(t => ({ section: t.section, name: t.name, restricted: t.restricted }))
    };
  }).filter(l => l.tasks.length);
}

function empFromRow_(r) {
  return { id: clean_(r[0]), store: clean_(r[1]), name: clean_(r[2]), dob: ymd_(r[3]), start: ymd_(r[4]),
    position: clean_(r[5]), status: clean_(r[6]) || 'Active', mit: clean_(r[7]), notes: clean_(r[8]) };
}
function readEmployees_() { return rows_(SH.EMP).filter(r => clean_(r[0])).map(empFromRow_); }
// One employee by ID, without reading the whole Employees tab.
function findEmployee_(id) { const hit = findRow_(SH.EMP, clean_(id)); return hit ? empFromRow_(hit.values) : null; }

function readProgress_() {
  return rows_(SH.PROG).map(r => ({
    emp: clean_(r[0]), level: clean_(r[1]), section: clean_(r[2]), task: clean_(r[3]), done: bool_(r[4]),
    at: r[6] instanceof Date ? r[6] : (r[6] ? new Date(r[6]) : null)
  }));
}

function readPofs_() {
  return rows_(SH.POF).filter(r => clean_(r[0])).map(r => ({
    id: clean_(r[0]), emp: clean_(r[1]), position: clean_(r[2]), date: ymd_(r[3]), trainer: clean_(r[4]),
    score: Number(r[5]) || 0, answers: clean_(r[6]), comments: clean_(r[7])
  }));
}

function bootstrap_(u) {
  const stores = cachedRows_(SH.STORES, 300).filter(r => u.stores.indexOf(clean_(r[0])) > -1)
    .map(r => ({ id: clean_(r[0]), name: clean_(r[1]), market: clean_(r[2]) }));
  return { user: { name: u.name, role: u.role }, stores: stores, levels: getLevels_(), today: ymd_(new Date()),
    positions: POSITIONS, sequential: SEQUENTIAL_LEVELS,
    pof: { pass: POF_PASS, restricted: POF_RESTRICTED,
      forms: POF_ORDER.map(p => ({ position: p, sections: POF_FORMS[p].map(s => ({ name: s[0], items: s[1] })) })) } };
}

/* ---------------- Web app API ---------------- */

function getRoster(token, storeId) {
  const u = auth_(token); canSee_(u, storeId);
  const emps = readEmployees_().filter(e => e.store === clean_(storeId));
  const ids = {}; emps.forEach(e => ids[e.id] = true);
  const progress = {};
  readProgress_().forEach(p => {   // rows are in time order, so the newest row for each item wins
    if (!ids[p.emp]) return;
    const m = progress[p.emp] = progress[p.emp] || {}, k = key_(p.level, p.section, p.task);
    if (p.done) m[k] = p.at && !isNaN(p.at) ? p.at.toISOString() : 'yes'; else delete m[k];
  });
  const pofs = {};
  readPofs_().forEach(f => { if (ids[f.emp]) (pofs[f.emp] = pofs[f.emp] || []).push(f); });
  return { employees: emps, progress: progress, pofs: pofs };
}

function saveEmployee(token, e) {
  const u = auth_(token);
  const name = clean_(e.name);
  if (!name) throw new Error('Enter the employee\'s name.');
  log_(u, e.id ? 'Edited employee' : 'Added employee', e.id ? (findEmployee_(e.id) || {}).store : e.store, name);
  const row = [name, ymd_(e.dob), ymd_(e.start), POSITIONS.indexOf(e.position) > -1 ? e.position : POSITIONS[0],
    ['Active', 'Inactive', 'Former'].indexOf(e.status) > -1 ? e.status : 'Active', MIT_STATES.indexOf(e.mit) > -1 ? e.mit : '', clean_(e.notes)];
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const s = sheet_(SH.EMP);
    if (e.id) {
      const hit = findRow_(SH.EMP, e.id);
      if (!hit) throw new Error('That employee no longer exists. Refresh and try again.');
      canSee_(u, hit.values[1]);
      s.getRange(hit.row, 3, 1, row.length).setValues([row]);
      bump_();
      return { id: e.id };
    }
    canSee_(u, e.store);
    const id = 'E' + Utilities.getUuid().slice(0, 8);
    append_(SH.EMP, [[id, clean_(e.store)].concat(row, [new Date()])]);
    bump_();
    return { id: id };
  } finally { lock.releaseLock(); }
}

function setTask(token, empId, level, section, task, done) {
  const u = auth_(token);
  const emp = findEmployee_(empId);
  if (!emp) throw new Error('Employee not found. Refresh and try again.');
  logEmp_(u, bool_(done) ? 'Checked off task' : 'Unchecked task', emp, level + ' – ' + task);
  canSee_(u, emp.store);
  const lv = getLevels_().find(l => norm_(l.name) === norm_(level));
  const t = lv && lv.tasks.find(x => norm_(x.section) === norm_(section) && norm_(x.name) === norm_(task));
  if (!t) throw new Error('That task is no longer on the list. Refresh and try again.');
  if (done && t.restricted) {
    const a = age_(emp.dob, new Date());
    if (a === null) throw new Error('Add a date of birth before signing off ' + t.section + ' tasks.');
    if (a < 18) throw new Error(t.section + ': ' + t.name + ' is restricted for employees under 18.');
  }
  if (lv.name === 'MIT' && !emp.mit) throw new Error('Enroll ' + emp.name + ' in the MIT program before checking off MIT items.');
  if (done && SEQUENTIAL_LEVELS.indexOf(lv.name) > -1) {
    const have = currentChecks_(empId);
    const open = lv.tasks.find(x => x.section !== t.section && !have[key_(lv.name, x.section, x.name)] &&
      lv.tasks.indexOf(x) < lv.tasks.indexOf(t));
    if (open) throw new Error('Finish ' + open.section + ' before moving on to ' + t.section + '.');
  }
  // Every check or uncheck is added as a new row (fast). The newest row for an item is the one that counts.
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try { append_(SH.PROG, [[empId, lv.name, t.section, t.name, !!done, u.name || u.email, new Date()]]); }
  finally { lock.releaseLock(); }
  bump_();
  return true;
}

// What's currently checked for one employee: { key: true }.
function currentChecks_(empId) {
  const have = {};
  readProgress_().forEach(p => { if (p.emp !== empId) return; const k = key_(p.level, p.section, p.task); if (p.done) have[k] = true; else delete have[k]; });
  return have;
}

function savePof(token, empId, pof) {
  const u = auth_(token);
  const emp = findEmployee_(empId);
  if (!emp) throw new Error('Employee not found. Refresh and try again.');
  logEmp_(u, 'Recorded POF', emp, clean_(pof && pof.position));
  canSee_(u, emp.store);
  const position = clean_(pof && pof.position);
  if (!POF_FORMS[position]) throw new Error('That position isn\'t on the POF list.');
  if (POF_RESTRICTED.indexOf(position) > -1) {
    const a = age_(emp.dob, new Date());
    if (a === null) throw new Error('Add a date of birth before doing a ' + position + ' POF.');
    if (a < 18) throw new Error('The ' + position + ' POF is restricted for employees under 18.');
  }
  const answers = String(pof.answers || '');
  const n = pofItemCount_(position);
  if (answers.length !== n || /[^yn]/.test(answers)) throw new Error('Answer yes or no for every item before saving.');
  const date = ymd_(pof.date) || ymd_(new Date());
  const score = Math.round(100 * answers.split('').filter(c => c === 'y').length / n);
  const rec = { id: 'P' + Utilities.getUuid().slice(0, 8), emp: empId, position: position, date: date,
    trainer: clean_(pof.trainer) || u.name, score: score, answers: answers, comments: clean_(pof.comments) };
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    append_(SH.POF, [[rec.id, rec.emp, rec.position, rec.date, rec.trainer, rec.score, rec.answers, rec.comments, u.name || u.email, new Date()]]);
  } finally { lock.releaseLock(); }
  bump_();
  return rec;
}

function getOverview(token) {
  const u = auth_(token);
  if (u.role === 'manager') throw new Error('The all-stores view is for district managers and admins.');
  return cached_('overview', u.stores.join(','), () => { const ctx = context_(); return u.stores.map(id => storeStats_(id, ctx)); });
}

/* ---------------- Stats (shared by overview, trends, scorecard, and email) ---------------- */

function context_() {
  const pmap = {};
  readProgress_().forEach(p => { (pmap[p.emp] = pmap[p.emp] || {})[key_(p.level, p.section, p.task)] = p; });
  const stores = {};
  cachedRows_(SH.STORES, 300).forEach(r => stores[clean_(r[0])] = { name: clean_(r[1]), market: clean_(r[2]) });
  const pofs = {};
  readPofs_().forEach(f => (pofs[f.emp] = pofs[f.emp] || []).push(f));
  return { now: new Date(), levels: getLevels_(), emps: readEmployees_(), pmap: pmap, pofs: pofs, stores: stores };
}

function empStats_(e, ctx) {
  const age = age_(e.dob, ctx.now), minor = age !== null && age < 18;
  const p = ctx.pmap[e.id] || {};
  const levels = ctx.levels.filter(l => l.name !== 'MIT' || e.mit).map(l => {
    const tasks = l.tasks.filter(t => !(t.restricted && minor));
    const doneRows = tasks.map(t => p[key_(l.name, t.section, t.name)]).filter(x => x && x.done);
    const dates = doneRows.map(x => x.at).filter(d => d && !isNaN(d));
    const done = doneRows.length;
    return {
      name: l.name, done: done, total: tasks.length, pct: pct_(done, tasks.length),
      first: dates.length ? new Date(Math.min.apply(null, dates)) : null,
      completedAt: tasks.length && done === tasks.length && dates.length ? new Date(Math.max.apply(null, dates)) : null
    };
  });
  let last = null, week = 0, prevWeek = 0;
  Object.keys(p).forEach(k => {
    const at = p[k].at;
    if (at && (!last || at > last)) last = at;
    if (p[k].done && at) {
      if (ctx.now - at < 7 * DAY) week++;
      else if (ctx.now - at < 14 * DAY) prevWeek++;
    }
  });
  const start = parseYmd_(e.start);
  return { e: e, age: age, minor: minor, levels: levels, last: last, week: week, prevWeek: prevWeek, stage: stage_(e, levels),
    tenure: start ? Math.floor((ctx.now - start) / 864e5) : null };
}

// Where someone is in the path: Phase 1 -> Phase 3 -> Phase 2 -> (enrolled people) MIT.
// Anyone who has finished Phase 2 stays counted under Phase 2 until they are enrolled in MIT.
const CERT_ORDER = ['Phase 1', 'Phase 3', 'Phase 2'];
function stage_(e, levels) {
  if (e.mit === 'Enrolled' || e.mit === 'Graduated') return 'MIT';
  for (let i = 0; i < CERT_ORDER.length; i++) {
    const l = levels.find(x => x.name === CERT_ORDER[i]);
    // Finishing Phase 1 doesn't put someone into Phase 3: they start once a Phase 3 box is checked (shift leaders always do).
    if (CERT_ORDER[i] === 'Phase 3' && e.position !== 'Shift Leader' && !(l && l.done > 0)) return 'Phase 1';
    if (l && l.done < l.total) return l.name;
  }
  return CERT_ORDER[CERT_ORDER.length - 1];
}
const STAGES = ['Phase 1', 'Phase 3', 'Phase 2', 'MIT'];

// Days each completed phase took: Phase 1 from start date, each later phase from the previous one's completion,
// MIT from its first check-off to its last.
function durations_(s) {
  const out = {};
  let prev = parseYmd_(s.e.start);
  CERT_ORDER.forEach(n => {
    const l = s.levels.find(x => x.name === n);
    if (!l || !l.completedAt) { prev = null; return; }
    if (prev) out[n] = Math.max(0, Math.round((l.completedAt - prev) / DAY));
    prev = l.completedAt;
  });
  const m = s.levels.find(x => x.name === 'MIT');
  if (m && m.completedAt && m.first) out.MIT = Math.max(0, Math.round((m.completedAt - m.first) / DAY));
  return out;
}

// Trends: last 7 days vs the 7 days before, per store, plus who is training right now.
function getTrends(token) {
  const u = auth_(token);
  return cached_('trends', u.stores.join(','), () => trends_(u));
}
function trends_(u) {
  const ctx = context_();
  const names = ctx.levels.map(l => l.name);
  const people = [];
  const stores = u.stores.map(id => {
    const st = ctx.stores[id] || { name: id, market: '' };
    const staff = ctx.emps.filter(e => e.store === id).map(e => empStats_(e, ctx));
    const spans = {}; names.forEach(n => spans[n] = []);
    let pofs7 = 0;
    staff.forEach(s => {
      const d = durations_(s);
      Object.keys(d).forEach(n => spans[n].push(d[n]));
      pofs7 += (ctx.pofs[s.e.id] || []).filter(f => { const x = parseYmd_(f.date); return x && ctx.now - x < 7 * DAY; }).length;
      if (s.week > 0) {
        const cur = s.levels.find(l => l.name === s.stage);
        people.push({ name: s.e.name, store: st.name, stage: s.stage, pct: cur ? cur.pct : null, week: s.week, prevWeek: s.prevWeek });
      }
    });
    const avgDays = {};
    names.forEach(n => avgDays[n] = spans[n].length ? { avg: Math.round(spans[n].reduce((a, b) => a + b, 0) / spans[n].length), n: spans[n].length } : null);
    return { id: id, name: st.name, market: st.market, staff: staff.filter(s => !isOff_(s.e.status)).length,
      week: staff.reduce((a, s) => a + s.week, 0), prevWeek: staff.reduce((a, s) => a + s.prevWeek, 0),
      training: staff.filter(s => s.week > 0).length, pofs7: pofs7, avgDays: avgDays };
  });
  people.sort((a, b) => b.week - a.week || a.name.localeCompare(b.name));
  return { levels: names, stores: stores, people: people };
}

function storeStats_(id, ctx) {
  const st = ctx.stores[id] || { name: id, market: '' };
  const staff = ctx.emps.filter(e => e.store === id && !isOff_(e.status)).map(e => empStats_(e, ctx));
  const tenures = staff.map(s => s.tenure).filter(t => t !== null && t >= 0);
  const count = f => staff.filter(f).length;
  return {
    id: id, name: st.name, market: st.market,
    active: staff.length,
    positions: POSITIONS.map(p => ({ name: p, count: count(s => s.e.position === p) })),
    minors: count(s => s.minor),
    ages: { under16: count(s => s.age !== null && s.age < 16), age16to17: count(s => s.age === 16 || s.age === 17),
      adult: count(s => s.age !== null && s.age >= 18), unknown: count(s => s.age === null) },
    tenure: { avgDays: tenures.length ? Math.round(tenures.reduce((a, b) => a + b, 0) / tenures.length) : null,
      under90: tenures.filter(t => t < 90).length, to1yr: tenures.filter(t => t >= 90 && t < 365).length,
      over1yr: tenures.filter(t => t >= 365).length },
    newHires: count(s => s.tenure !== null && s.tenure <= NEW_HIRE_DAYS),
    finished: CERT_ORDER.concat(['ServSafe']).map(n => ({ name: n,
      count: count(s => { const l = s.levels.find(x => x.name === n); return l && l.total > 0 && l.done === l.total; }) })),
    stages: STAGES.map(n => {
      const inStage = staff.filter(s => s.stage === n);
      const pcts = inStage.map(s => (s.levels.find(l => l.name === n) || {}).pct).filter(x => typeof x === 'number');
      return { name: n, count: inStage.length, avgPct: pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null };
    }),
    peopleThisWeek: count(s => s.week > 0),
    peoplePrevWeek: count(s => s.prevWeek > 0),
    shiftLeaders: count(s => s.e.position === 'Shift Leader'),
    slCertified: CERT_ORDER.map(n => ({ name: n, count: count(s => s.e.position === 'Shift Leader' &&
      (l => l && l.total > 0 && l.done === l.total)(s.levels.find(x => x.name === n))) })),
    checksThisWeek: staff.reduce((a, s) => a + s.week, 0),
    checksPrevWeek: staff.reduce((a, s) => a + s.prevWeek, 0),
    pofsThisWeek: [].concat.apply([], staff.map(s => ctx.pofs[s.e.id] || []))
      .filter(f => { const d = parseYmd_(f.date); return d && ctx.now - d < 7 * DAY; }),
    completedThisWeek: [].concat.apply([], staff.map(s => s.levels
      .filter(l => l.completedAt && ctx.now - l.completedAt < 7 * DAY)
      .map(l => s.e.name + ' finished ' + (l.name === 'MIT' ? 'the MIT program' : l.name)))),
    stalled: staff.filter(s => ['Phase 1', 'Phase 3', 'Phase 2', 'MIT'].indexOf(s.stage) > -1 &&
      s.tenure !== null && s.tenure >= STALL_MIN_TENURE && (!s.last || ctx.now - s.last > STALL_DAYS * 864e5)
    ).map(s => s.e.name + ' (' + s.stage + ')'),
    missing: staff.filter(s => !s.e.dob || !s.e.start).map(s => s.e.name)
  };
}

/* ---------------- Weekly email ---------------- */

function sendWeeklyReport() {
  try { compactProgress_(); } catch (e) { Logger.log('Tidy-up skipped: ' + e.message); }
  const to = setting_('Weekly email recipients');
  if (!to) throw new Error('Add recipients on the Settings tab.');
  const ctx = context_();
  const stats = allStoreIds_().map(id => storeStats_(id, ctx));
  MailApp.sendEmail({
    to: to,
    subject: 'Training update: week of ' + Utilities.formatDate(ctx.now, tz_(), 'MMM d'),
    htmlBody: reportHtml_(stats, ctx),
    name: 'Legend Subs Training'
  });
}

function fmtTenure_(days) {
  if (days === null) return '–';
  if (days < 60) return days + ' days';
  const mo = Math.round(days / 30.44);
  return mo < 24 ? mo + ' mo' : (mo / 12).toFixed(1) + ' yrs';
}

// "38 (up from 21)" style week-over-week text.
function trend_(now, before) {
  if (now === before) return now + ' (same as prior week)';
  return now + ' (' + (now > before ? 'up' : 'down') + ' from ' + before + ')';
}

// The weekly email: four headline numbers, one row per store, and a short "this week" list.
function reportHtml_(stats, ctx) {
  const navy = '#13294B', grey = '#5B6878', faint = '#8A96A6', green = '#1F8A5B', red = '#C8102E';
  const th = 'style="text-align:right;padding:6px;border-bottom:2px solid ' + navy + ';font-size:11px;color:' + grey + ';font-weight:600;white-space:nowrap;vertical-align:bottom"';
  const th1 = th.replace('text-align:right', 'text-align:left');
  const td = 'style="padding:7px 6px;border-bottom:1px solid #E2E7EE;font-size:13px;text-align:right;white-space:nowrap"';
  const td1 = td.replace('text-align:right', 'text-align:left');
  const small = t => '<div style="font-size:11px;color:' + faint + ';font-weight:400">' + t + '</div>';
  const muted = t => '<span style="color:' + faint + '">' + t + '</span>';
  const chip = v => {
    if (v === null) return '<span style="display:inline-block;min-width:40px;text-align:center;padding:2px 6px;border-radius:5px;background:#EEF1F5;color:' + grey + ';font-weight:600">New</span>';
    const c = v >= 90 ? ['#E3F3EB', green] : v >= 75 ? ['#FFF3D6', '#8A5A00'] : ['#FCE8EB', red];
    return '<span style="display:inline-block;min-width:40px;text-align:center;padding:2px 6px;border-radius:5px;background:' + c[0] + ';color:' + c[1] + ';font-weight:600">' + v + '</span>';
  };
  const pct = (a, b) => b ? Math.round(100 * a / b) : 0;
  const change = (now, before) => {
    if (!now && !before) return '';
    if (!before) return ' <span style="color:' + green + ';font-weight:600">New</span>';
    if (now === before) return ' ' + muted('same');
    return ' <span style="color:' + (now > before ? green : red) + ';font-weight:600">' + (now > before ? '▲' : '▼') + ' from ' + before + '%</span>';
  };

  const rows = stats.map(s => Object.assign({}, s, scoreRow_(s.id, ctx)))
    .sort((a, b) => (b.score === null ? -1 : b.score) - (a.score === null ? -1 : a.score) || a.name.localeCompare(b.name));
  const scored = rows.filter(r => r.score !== null);
  const avgScore = scored.length ? Math.round(scored.reduce((a, r) => a + r.score, 0) / scored.length) : null;
  const allPof = [].concat.apply([], rows.map(r => r.pofScores));
  const pofAvg = allPof.length ? Math.round(allPof.reduce((a, b) => a + b, 0) / allPof.length) : null;
  const staffTot = rows.reduce((a, r) => a + r.active, 0);
  const actNow = pct(rows.reduce((a, r) => a + r.peopleThisWeek, 0), staffTot);
  const actBefore = pct(rows.reduce((a, r) => a + r.peoplePrevWeek, 0), staffTot);
  const completions = [].concat.apply([], rows.map(r => r.completedThisWeek.map(x => x + ' (' + r.name + ')')));
  const quiet = rows.filter(r => r.active && !r.peopleThisWeek).map(r => r.name);
  const missing = rows.reduce((a, r) => a + r.missing.length, 0);
  const fin = (r, n) => (r.finished.find(x => x.name === n) || { count: 0 }).count;
  const sl = (r, n) => (r.slCertified.find(x => x.name === n) || { count: 0 }).count;

  const tile = (n, l) => '<td style="width:25%;padding:4px"><div style="border:1px solid #D8DEE6;border-radius:8px;padding:9px 10px">' +
    '<div style="font-size:24px;font-weight:600;color:' + navy + ';line-height:1.1">' + n + '</div><div style="font-size:12px;color:' + grey + '">' + l + '</div></div></td>';

  let h = '<div style="font-family:Arial,sans-serif;color:#1C2633;max-width:760px">';
  h += '<div style="background:' + navy + ';color:#fff;padding:14px 18px;border-radius:8px 8px 0 0"><div style="font-size:18px;font-weight:600">Weekly training update</div>' +
    '<div style="font-size:13px;opacity:.85">Week of ' + Utilities.formatDate(ctx.now, tz_(), 'MMM d') + ' · ' + rows.length + ' stores · ' + staffTot + ' employees</div></div>';
  h += '<div style="padding:14px 4px">';
  h += '<table style="width:100%;border-collapse:collapse"><tr>' +
    tile(avgScore === null ? '–' : avgScore, 'Average store score') +
    tile(pofAvg === null ? '–' : pofAvg + '%', 'POF average') +
    tile(actNow + '%', 'Active this week' + change(actNow, actBefore)) +
    tile(completions.length, 'Phases completed') + '</tr></table>';

  h += '<div style="font-size:15px;font-weight:600;color:' + navy + ';margin:16px 0 6px">Stores, best score first</div>';
  h += '<table style="border-collapse:collapse;width:100%"><tr>' +
    '<th ' + th1 + '>Store</th><th ' + th + '>Score</th><th ' + th + '>POF avg</th>' +
    '<th ' + th + '>Phase 1' + small('certified') + '</th><th ' + th + '>Phase 3' + small('shift leaders') + '</th><th ' + th + '>Phase 2' + small('shift leaders') + '</th>' +
    '<th ' + th + '>Active this week</th><th ' + th + '>Missing info</th></tr>';
  rows.forEach(r => {
    const now = pct(r.peopleThisWeek, r.active), before = pct(r.peoplePrevWeek, r.active);
    h += '<tr><td ' + td1 + '><b>' + esc_(r.name) + '</b></td>' +
      '<td ' + td + '>' + chip(r.score) + '</td>' +
      '<td ' + td + '>' + (r.pofAvg === null ? muted('–') : r.pofAvg + '%') + '</td>' +
      '<td ' + td + '>' + fin(r, 'Phase 1') + ' of ' + r.active + '</td>' +
      '<td ' + td + '>' + (r.shiftLeaders ? sl(r, 'Phase 3') + ' of ' + r.shiftLeaders : muted('–')) + '</td>' +
      '<td ' + td + '>' + (r.shiftLeaders ? sl(r, 'Phase 2') + ' of ' + r.shiftLeaders : muted('–')) + '</td>' +
      '<td ' + td + '>' + (now ? now + '%' : muted('0%')) + change(now, before) + (r.peopleThisWeek ? small(r.peopleThisWeek + ' of ' + r.active) : '') + '</td>' +
      '<td ' + td + '>' + (r.missing.length || muted('0')) + '</td></tr>';
  });
  h += '</table>';

  h += '<div style="font-size:15px;font-weight:600;color:' + navy + ';margin:16px 0 6px">This week</div><ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6">';
  h += '<li><b>' + completions.length + ' phase' + (completions.length === 1 ? '' : 's') + ' completed' + (completions.length ? ':</b> ' + esc_(completions.join(', ')) : '.</b>') + '</li>';
  if (quiet.length) h += '<li><b>No training activity this week:</b> ' + esc_(quiet.join(', ')) + '</li>';
  if (missing) h += '<li><b>Missing date of birth or start date:</b> ' + missing + ' ' + (missing === 1 ? 'person' : 'people') + '. See the roster\'s "Missing info" badge.</li>';
  h += '</ul>';
  const link = setting_('App link');
  if (link) h += '<p style="margin:16px 0 0"><a href="' + esc_(link) + '" style="display:inline-block;background:' + navy + ';color:#fff;padding:9px 16px;border-radius:6px;font-size:13px;text-decoration:none">Open the training app</a></p>';
  h += '<p style="font-size:11px;color:' + faint + ';margin-top:14px;line-height:1.5"><b>Score</b> = ' + SCORE_TRAINED_WEIGHT + '% training complete + ' + (100 - SCORE_TRAINED_WEIGHT) + '% POF average. ' +
    'Training complete means ' + POSITIONS.map(p => TRAINED_REQUIREMENT[p].join(' + ') + ' for ' + p.toLowerCase() + 's').join(' and ') + '. ' +
    (PHASE2_BONUS ? 'Shift leaders who finish Phase 2 add a bonus of up to ' + PHASE2_BONUS + ' points; it never lowers a score. ' : '') +
    'Everyone counts from their first day. <b>Active this week</b> is the share of staff who had any training signed off in the last 7 days, compared with the week before.</p>';
  return h + '</div></div>';
}

function installWeeklyTrigger() {
  const s = installTrigger_();
  alert_('Weekly email is on: every ' + s.day + ' around ' + s.hour + ':00. Use "Send weekly email now" to preview it.');
}

// (Re)creates the weekly email schedule from the Settings tab.
function installTrigger_() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'sendWeeklyReport').forEach(t => ScriptApp.deleteTrigger(t));
  const dayName = (setting_('Weekly email day') || 'Monday').toUpperCase();
  const day = ScriptApp.WeekDay[dayName] || ScriptApp.WeekDay.MONDAY;
  const hour = Math.min(23, Math.max(0, parseInt(setting_('Weekly email hour (0-23)'), 10) || 7));
  ScriptApp.newTrigger('sendWeeklyReport').timeBased().onWeekDay(day).atHour(hour).create();
  return { day: dayName.charAt(0) + dayName.slice(1).toLowerCase(), hour: hour };
}

/* ---------------- Weekly email controls in the app (admins and DMs) ---------------- */

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function setSetting_(k, v) {
  const s = sheet_(SH.SET);
  const i = rows_(SH.SET).findIndex(r => norm_(r[0]) === norm_(k));
  if (i > -1) s.getRange(i + 2, 2).setValue(v); else append_(SH.SET, [[k, v]]);
}
function requireLead_(u) {
  if (u.role === 'manager') throw new Error('Only admins and district managers can change the weekly email.');
}

function getEmailSettings(token) {
  requireLead_(auth_(token));
  return {
    to: setting_('Weekly email recipients'),
    day: setting_('Weekly email day') || 'Monday',
    hour: parseInt(setting_('Weekly email hour (0-23)'), 10) || 7,
    on: ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'sendWeeklyReport'),
    days: WEEKDAYS
  };
}

function saveEmailSettings(token, s) {
  requireLead_(auth_(token));
  const list = String(s.to || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  if (!list.length) throw new Error('Add at least one email address.');
  const bad = list.filter(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
  if (bad.length) throw new Error('These don\'t look like email addresses: ' + bad.join(', '));
  const day = WEEKDAYS.find(d => norm_(d) === norm_(s.day)) || 'Monday';
  const hour = Math.min(23, Math.max(0, parseInt(s.hour, 10) || 0));
  setSetting_('Weekly email recipients', list.join(', '));
  setSetting_('Weekly email day', day);
  setSetting_('Weekly email hour (0-23)', String(hour));
  CacheService.getScriptCache().remove('tab:' + SH.SET); delete MEMO_[SH.SET];
  installTrigger_();
  return getEmailSettings(token);
}

function sendEmailNow(token) {
  requireLead_(auth_(token));
  sendWeeklyReport();
  return setting_('Weekly email recipients');
}

/* ---------------- Check (or uncheck) a whole phase or station at once ---------------- */
// section is optional: leave it blank to do the whole phase. Restricted items are skipped for anyone under 18
// or without a date of birth. Returns how many items changed and what was skipped.
function setManyTasks(token, empId, level, section, done) {
  const u = auth_(token);
  const emp = findEmployee_(empId);
  if (!emp) throw new Error('Employee not found. Refresh and try again.');
  logEmp_(u, bool_(done) ? 'Checked off section' : 'Unchecked section', emp, level + ' – ' + section);
  canSee_(u, emp.store);
  const lv = getLevels_().find(l => norm_(l.name) === norm_(level));
  if (!lv) throw new Error('That phase is no longer on the list. Refresh and try again.');
  if (lv.name === 'MIT' && !emp.mit) throw new Error('Enroll ' + emp.name + ' in the MIT program before checking off MIT items.');
  let tasks = lv.tasks.filter(t => !section || norm_(t.section) === norm_(section));
  const a = age_(emp.dob, new Date());
  const skipped = [];
  if (done) {
    tasks = tasks.filter(t => {
      if (t.restricted && (a === null || a < 18)) { skipped.push(t.section + ': ' + t.name); return false; }
      return true;
    });
  }
  const have = currentChecks_(empId);
  if (done && section && SEQUENTIAL_LEVELS.indexOf(lv.name) > -1) {
    const firstIdx = lv.tasks.findIndex(t => norm_(t.section) === norm_(section));
    const open = lv.tasks.slice(0, firstIdx).find(t => !have[key_(lv.name, t.section, t.name)]);
    if (open) throw new Error('Finish ' + open.section + ' before moving on to ' + section + '.');
  }
  const now = new Date(), who = u.name || u.email;
  const add = tasks.filter(t => !!have[key_(lv.name, t.section, t.name)] !== !!done)
    .map(t => [empId, lv.name, t.section, t.name, !!done, who, now]);
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    append_(SH.PROG, add);
    if (add.length) bump_();
    return { changed: add.length, skipped: skipped, at: now.toISOString() };
  } finally { lock.releaseLock(); }
}

/* ---------------- Store training scorecard ---------------- */
// Score = 70% training complete + 30% POF average (training complete only, if a store has no POFs yet),
// plus bonus points: +PHASE2_BONUS for each person who finished Phase 2 and +MIT_BONUS for each who finished MIT,
// capped at BONUS_CAP in total. The bonus only ever adds, so a store can score above 100 (up to 100 + BONUS_CAP).
// "Training complete" depends on position. Everyone counts from their hire date (no new-hire grace period).
// Only each person's most recent POF per position counts, and POFs don't expire.
const SCORE_TRAINED_WEIGHT = 70;     // the POF average gets the rest (100 - this)
const SCORE_GRACE_DAYS = 0; 
const PHASE2_BONUS = 3;              // bonus points for each person who finished Phase 2
const MIT_BONUS = 5;                 // bonus points for each person who finished MIT
const BONUS_CAP = 15;                // most bonus points a store can earn
const TRAINED_REQUIREMENT = { 'Crew Member': ['Phase 1'], 'Shift Leader': ['Phase 1', 'Phase 3'] };
function needsText_(p) { return TRAINED_REQUIREMENT[p].join(' + '); }

function getScorecard(token) {
  const u = auth_(token);
  return cached_('scorecard5', u.stores.join(','), () => scorecard_(u));
}
function scorecard_(u) {
  const ctx = context_();
  const all = Object.keys(ctx.stores).map(id => scoreRow_(id, ctx));
  return { stores: u.stores.map(id => all.find(r => String(r.id) === String(id)) || scoreRow_(id, ctx)), company: companyRow_(all), positions: POF_ORDER, weight: SCORE_TRAINED_WEIGHT, grace: SCORE_GRACE_DAYS, pass: POF_PASS,
    p2Bonus: PHASE2_BONUS, mitBonus: MIT_BONUS, bonusCap: BONUS_CAP,
    requirement: POSITIONS.map(p => ({ position: p, needs: needsText_(p) })) };
}

// Company-wide reference row: averages across every store that has staff.
function companyRow_(rows) {
  const has = rows.filter(r => r.counted > 0);
  const avg = a => { const v = a.filter(x => x !== null && x !== undefined); return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null; };
  const sum = f => has.reduce((a, r) => a + f(r), 0);
  const counted = sum(r => r.counted), trained = sum(r => r.trained);
  return {
    id: '', name: 'Company average', company: true, storeCount: has.length,
    score: avg(has.map(r => r.score)), bonus: avg(has.map(r => r.bonus)),
    trained: trained, counted: counted, trainedPct: counted ? Math.round(100 * trained / counted) : null,
    byPos: (has[0] ? has[0].byPos : []).map((b, i) => ({ position: b.position, needs: b.needs, trained: sum(r => r.byPos[i].trained), total: sum(r => r.byPos[i].total) })),
    pofAvg: avg(has.map(r => r.pofAvg)), pofPeople: sum(r => r.pofPeople),
    notTrained: avg(has.map(r => r.notTrained)), stable: false,
    pofByPos: POF_ORDER.map((p, i) => ({ position: p, avg: avg(has.map(r => r.pofByPos[i].avg)), n: sum(r => r.pofByPos[i].n) }))
  };
}

// One store's scorecard numbers (used by the Scorecard tab and the weekly email).
function scoreRow_(id, ctx) {
  const st = ctx.stores[id] || { name: id, market: '' };
  const staff = ctx.emps.filter(e => e.store === id && !isOff_(e.status)).map(e => empStats_(e, ctx));
  const counted = staff.filter(s => s.tenure === null || s.tenure >= SCORE_GRACE_DAYS);
  const isTrained = s => (TRAINED_REQUIREMENT[s.e.position] || TRAINED_REQUIREMENT['Crew Member'])
    .every(n => { const l = s.levels.find(x => x.name === n); return l && l.total > 0 && l.done === l.total; });
  const byPos = POSITIONS.map(p => {
    const grp = counted.filter(s => (TRAINED_REQUIREMENT[s.e.position] ? s.e.position : 'Crew Member') === p);
    return { position: p, needs: needsText_(p), trained: grp.filter(isTrained).length, total: grp.length };
  });
  const trained = counted.filter(isTrained).length;
  const trainedPct = counted.length ? Math.round(100 * trained / counted.length) : null;

  // Bonus: points for each person who finished Phase 2 or MIT, capped at BONUS_CAP.
  const finished = (s, name) => { const l = s.levels.find(x => x.name === name); return !!l && l.total > 0 && l.done === l.total; };
  const p2 = counted.filter(s => finished(s, 'Phase 2')).length;
  const mit = counted.filter(s => s.e.mit === 'Graduated' || finished(s, 'MIT')).length;
  const bonus = Math.min(BONUS_CAP, PHASE2_BONUS * p2 + MIT_BONUS * mit);

  // Latest POF per person per position.
  const pof = {}; POF_ORDER.forEach(p => pof[p] = []);
  staff.forEach(s => {
    const latest = {};
    (ctx.pofs[s.e.id] || []).forEach(f => { if (!latest[f.position] || f.date >= latest[f.position].date) latest[f.position] = f; });
    Object.keys(latest).forEach(p => { if (pof[p]) pof[p].push(latest[p].score); });
  });
  const avg = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : null;
  const allScores = [].concat.apply([], POF_ORDER.map(p => pof[p]));
  const pofAvg = avg(allScores);
  const base = trainedPct === null && pofAvg === null ? null
    : pofAvg === null ? trainedPct
    : trainedPct === null ? pofAvg
    : Math.round((SCORE_TRAINED_WEIGHT * trainedPct + (100 - SCORE_TRAINED_WEIGHT) * pofAvg) / 100);
  const score = base === null ? null : base + bonus;
  return {
    id: id, name: st.name, market: st.market, score: score, bonus: bonus, p2People: p2, mitPeople: mit,
    trained: trained, counted: counted.length, trainedPct: trainedPct, byPos: byPos,
    newHires: staff.length - counted.length, notTrained: counted.filter(s => s.levels.every(l => !l.done)).length,
    stable: counted.length > 0 && trained === counted.length,
    pofAvg: pofAvg, pofPeople: allScores.length, pofScores: allScores,
    pofByPos: POF_ORDER.map(p => ({ position: p, avg: avg(pof[p]), n: pof[p].length }))
  };
}

/* ---------------- Upkeep ---------------- */

// Keeps only the newest row for each employee and item, and drops unchecked items. Runs automatically before
// each weekly email, and can be run any time from the Training App menu. Nothing anyone sees changes.
function compactProgress() { const r = compactProgress_(); alert_('Progress tab tidied: ' + r.before + ' rows down to ' + r.after + '.'); }
function compactProgress_() {
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    delete MEMO_[SH.PROG];
    const s = sheet_(SH.PROG), data = rows_(SH.PROG), latest = {}, order = [];
    data.forEach(r => {
      if (!clean_(r[0])) return;
      const k = clean_(r[0]) + '|' + key_(r[1], r[2], r[3]);
      if (!(k in latest)) order.push(k);
      latest[k] = r;
    });
    const when = r => r[6] instanceof Date ? r[6].getTime() : (new Date(r[6] || 0).getTime() || 0);
    const keep = order.map(k => latest[k]).filter(r => bool_(r[4])).sort((a, b) => when(a) - when(b));
    if (keep.length === data.length) return { before: data.length, after: data.length };
    if (data.length) s.getRange(2, 1, data.length, HEADERS.Progress.length).clearContent();
    if (keep.length) s.getRange(2, 1, keep.length, HEADERS.Progress.length).setValues(keep);
    delete MEMO_[SH.PROG]; bump_();
    return { before: data.length, after: keep.length };
  } finally { lock.releaseLock(); }
}

// Clears the "too many tries" lockout for every user on the Users tab.
function clearLockouts() {
  const keys = rows_(SH.USERS).map(r => 'fail:' + norm_(r[1])).filter(k => k !== 'fail:');
  CacheService.getScriptCache().removeAll(keys);
  alert_('Cleared login lockouts for ' + keys.length + ' users.');
}

/* ---------------- Transfer an employee to another store (admins and DMs) ---------------- */
// Admins can move anyone between any stores. DMs can move people between the stores they oversee.
// Training progress and POFs stay with the person, since they're linked by employee ID, not store.
function transferEmployee(token, empId, toStore) {
  const u = auth_(token);
  if (u.role === 'manager') throw new Error('Only admins and district managers can transfer employees.');
  toStore = clean_(toStore);
  logEmp_(u, 'Transferred employee', empId, 'to store ' + toStore);
  if (allStoreIds_().indexOf(toStore) === -1) throw new Error('Pick a store to transfer to.');
  canSee_(u, toStore);
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const hit = findRow_(SH.EMP, clean_(empId));
    if (!hit) throw new Error('Employee not found. Refresh and try again.');
    const from = clean_(hit.values[1]);
    canSee_(u, from);
    if (from === toStore) throw new Error('They already work at that store.');
    const names = {}; cachedRows_(SH.STORES, 300).forEach(r => names[clean_(r[0])] = clean_(r[1]));
    const note = 'Transferred from ' + (names[from] || from) + ' #' + from + ' to ' + (names[toStore] || toStore) + ' #' + toStore +
      ' on ' + Utilities.formatDate(new Date(), tz_(), 'MMM d, yyyy') + ' by ' + (u.name || u.email) + '.';
    const s = sheet_(SH.EMP);
    s.getRange(hit.row, 2).setValue(toStore);
    s.getRange(hit.row, 9).setValue(clean_(hit.values[8]) ? clean_(hit.values[8]) + ' ' + note : note);
    bump_();
    return { name: clean_(hit.values[2]), from: from, to: toStore, toName: names[toStore] || toStore };
  } finally { lock.releaseLock(); }
}

/* ---------------- Activity log (admins only) ----------------
   Every sign-in, app visit and training update is written to the "Activity" tab of the sheet
   (created automatically the first time). Admins see a summary in the app's Activity tab. */
const LOG_SHEET = 'Activity';
const LOG_HEADERS = ['When', 'Name', 'Email', 'Role', 'Store #', 'Action', 'Details'];
const LOG_VISIT_GAP = 60 * 60;   // log an app visit at most once an hour per person
const LOG_READ_MAX = 5000;       // only the newest rows are read for the Activity screen

let LOG_SHEET_ = null;
function logSheet_() {
  if (LOG_SHEET_) return LOG_SHEET_;
  const book = ss_();
  let s = book.getSheetByName(LOG_SHEET);
  if (!s) {
    s = book.insertSheet(LOG_SHEET);
    s.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]).setFontWeight('bold');
    s.setFrozenRows(1);
    s.getRange('E:E').setNumberFormat('@');
  }
  return LOG_SHEET_ = s;
}
// Never lets a logging problem break the action the person was doing.
function log_(u, action, store, details) {
  try {
    logSheet_().appendRow([new Date(), u.name, u.email, u.role, clean_(store), action, clean_(details)]);
  } catch (err) { console.warn('Activity log failed: ' + err); }
}
function logEmp_(u, action, emp, details) {
  try {
    const e = typeof emp === 'string' ? findEmployee_(emp) : emp;
    log_(u, action, e ? e.store : '', (e ? e.name : '') + (details ? ' — ' + details : ''));
  } catch (err) { console.warn('Activity log failed: ' + err); }
}
function logVisit_(u) {
  try {
    const c = CacheService.getScriptCache(), k = 'seen:' + u.email;
    if (c.get(k)) return;
    c.put(k, '1', LOG_VISIT_GAP);
    log_(u, 'Opened app', '', '');
  } catch (err) { console.warn('Activity log failed: ' + err); }
}

function getActivity(token, days) {
  const u = auth_(token);
  if (u.role !== 'admin') throw new Error('The activity log is for admins only.');
  days = Math.min(Math.max(parseInt(days, 10) || 14, 1), 365);
  const now = Date.now(), since = now - days * DAY, tz = tz_();
  const storeName = {};
  cachedRows_(SH.STORES, 300).forEach(r => { storeName[clean_(r[0])] = clean_(r[1]); });
  const storeLabel = raw => {
    raw = clean_(raw);
    if (!raw) return '';
    if (norm_(raw) === 'all') return 'All stores';
    return raw.split(/[,\s]+/).filter(Boolean).map(id => storeName[id] || ('#' + id)).join(', ');
  };

  const people = {}, covered = {};
  const person = (email, name, role, stores) => people[email] || (people[email] = {
    name: name, email: email, role: role, stores: stores, login: 'unknown', last: 0, lastAction: '', visits: 0, checks: 0, edits: 0 });
  rows_(SH.USERS).forEach(r => {
    const em = norm_(r[1]);
    if (!em || !bool_(r[5])) return;
    const pin = clean_(r[4]);
    person(em, clean_(r[0]), norm_(r[2]), storeLabel(r[3])).login = pin.indexOf('h:') === 0 ? 'ready' : pin ? 'pending' : 'none';
    if (pin.indexOf('h:') === 0) clean_(r[3]).split(/[,\s]+/).forEach(id => { covered[norm_(r[2]) === 'manager' ? id : ''] = true; });
  });

  const s = ss_().getSheetByName(LOG_SHEET);
  const last = s ? s.getLastRow() : 0;
  const n = Math.min(Math.max(last - 1, 0), LOG_READ_MAX);
  const rows = n ? s.getRange(last - n + 1, 1, n, LOG_HEADERS.length).getValues() : [];

  const recent = [];
  rows.forEach(r => {
    const t = r[0] instanceof Date ? r[0].getTime() : new Date(r[0]).getTime();
    if (isNaN(t)) return;
    const em = norm_(r[2]), action = clean_(r[5]);
    const p = person(em, clean_(r[1]), norm_(r[3]), '');
    if (t > p.last) { p.last = t; p.lastAction = action; }
    if (t < since) return;
    if (action === 'Signed in' || action === 'Opened app') p.visits++;
    else if (/^(Checked off|Unchecked)/.test(action)) p.checks++;
    else p.edits++;
    recent.push({ t: t, email: em, name: clean_(r[1]) || em, store: storeLabel(r[4]), action: action, details: clean_(r[6]) });
  });
  recent.sort((a, b) => b.t - a.t);

  const fmt = t => Utilities.formatDate(new Date(t), tz, 'EEE MMM d, h:mm a');
  const today = new Date(Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd') + 'T00:00:00').getTime();
  const dayOf = t => new Date(Utilities.formatDate(new Date(t), tz, 'yyyy-MM-dd') + 'T00:00:00').getTime();
  const users = Object.keys(people).map(k => people[k]).map(p => ({
    name: p.name || p.email, email: p.email, role: p.role, stores: p.stores, login: p.login,
    lastText: p.last ? fmt(p.last) : '', daysAgo: p.last ? Math.round((today - dayOf(p.last)) / DAY) : -1,
    lastAction: p.lastAction, visits: p.visits, checks: p.checks, edits: p.edits
  })).sort((a, b) => (a.login === 'none' || a.login === 'pending') - (b.login === 'none' || b.login === 'pending') || (a.daysAgo < 0) - (b.daysAgo < 0) || (a.daysAgo - b.daysAgo) || a.name.localeCompare(b.name));
  const noManagerLogin = cachedRows_(SH.STORES, 300).filter(r => !covered[clean_(r[0])]).map(r => clean_(r[1]) + ' #' + clean_(r[0]));

  return {
    days: days, users: users, total: recent.length, noManagerLogin: noManagerLogin,
    recent: recent.slice(0, 400).map(x => ({ when: fmt(x.t), email: x.email, name: x.name, store: x.store, action: x.action, details: x.details }))
  };
}
