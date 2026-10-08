export const KB_CATEGORIES = [
  {
    slug: 'getting-started',
    name: 'Getting Started',
    description: 'Your first days with FlowDesk: requests, roles and notifications.',
  },
  {
    slug: 'policies',
    name: 'Policies',
    description: 'Company policies that decide what can be requested and approved.',
  },
  {
    slug: 'procedures',
    name: 'Procedures',
    description: 'Step-by-step operating procedures for operations and finance.',
  },
  {
    slug: 'product-documentation',
    name: 'Product Documentation',
    description: 'Specifications and handling notes for stocked products.',
  },
  { slug: 'faqs', name: 'FAQs', description: 'Quick answers to the questions the service desk hears most.' },
];

type Article = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  tags: string[];
  author: string;
  daysAgo: number;
  body: string;
};

export const KB_ARTICLES: Article[] = [
  {
    slug: 'welcome-to-flowdesk',
    category: 'getting-started',
    title: 'Welcome to FlowDesk',
    summary:
      'What FlowDesk is for, how requests move through approval, and where to find things in the workspace.',
    tags: ['basics', 'navigation', 'requests'],
    author: 'admin@arunika.co.id',
    daysAgo: 60,
    body: `## What FlowDesk does

FlowDesk is where Arunika Group raises, approves and fulfils internal business requests — from a replacement laptop to VPN access for auditors — and where operations keeps inventory honest.

Everything you do is recorded, so you can always see **who** did **what** and **when**.

## The main areas

| Area | What you do there |
| --- | --- |
| Overview | See your open work, pending approvals and recent activity |
| Requests | Create, track and discuss requests |
| Monitor Real-Time | Watch requests and stock change live |
| Products | Browse the catalogue and stock levels |
| Knowledge Center | Read policies, procedures and FAQs |

## How a request moves

1. You create a **draft** and fill in the details.
2. You **submit** it. Managers are notified.
3. A manager **reviews** it and approves, rejects or asks for changes.
4. Operations **processes** approved requests and marks them **completed**.

> [!TIP] You can save a draft and come back later. Nobody else sees drafts until you submit them.

## Getting help

Search this Knowledge Center first — most questions are answered in the [FAQs](/knowledge?category=faqs). If you are stuck, contact the operations desk.`,
  },
  {
    slug: 'roles-and-permissions',
    category: 'getting-started',
    title: 'Roles and permissions explained',
    summary:
      'Employee, Manager, Operations and Admin — what each role can see and do, and how to request a change.',
    tags: ['roles', 'security', 'access'],
    author: 'admin@arunika.co.id',
    daysAgo: 58,
    body: `## The four roles

FlowDesk uses role-based access control. Your roles decide which actions are available — and the server checks them on every action, regardless of what buttons you can see.

| Role | Typical holder | Can do |
| --- | --- | --- |
| Employee | Everyone | Create, submit and comment on own requests, upload documents |
| Manager | Team leads, heads of department | Review, approve, reject, request changes, assign |
| Operations | Operations, IT support, procurement | Process and complete approved requests, record stock movements |
| Admin | IT governance | Manage users, roles, products, settings and audit logs |

A person can hold more than one role. The Head of Operations, for example, is both a Manager and Operations.

## What you can see

- **Employees** see requests they created or that are assigned to them.
- **Managers, Operations and Admins** see every request so they can review and fulfil them.

## Changing your role

Roles are granted by an administrator. Ask your manager to raise an **IT Access** request describing the role you need and why. When your roles change, you are signed out everywhere and sign back in with the new permissions.

> [!NOTE] Hiding a button is never the security boundary. Every request to the server is checked against your roles.`,
  },
  {
    slug: 'notifications-and-live-updates',
    category: 'getting-started',
    title: 'Notifications and live updates',
    summary:
      'Which events notify you, how the live connection works, and what the LIVE / RECONNECTING / OFFLINE indicator means.',
    tags: ['notifications', 'real-time', 'monitor'],
    author: 'fajar.nugroho@arunika.co.id',
    daysAgo: 41,
    body: `## When you are notified

You receive a notification when:

- your request is approved, rejected, or changes are requested
- your request starts processing or is completed
- a request is assigned to you
- someone comments on a request you are involved in
- (operations) a product reaches low stock or runs out

Notifications are kept until you remove them. Use **Mark all read** to clear the unread badge.

## The live indicator

The pill in the top bar shows your live connection:

| State | Meaning |
| --- | --- |
| LIVE | Connected — updates arrive instantly |
| RECONNECTING | The connection dropped and is being restored automatically |
| OFFLINE | No connection; refresh the page if it does not recover |

After reconnecting, live pages such as the Monitor reload their data from the database so nothing is missed.

> [!TIP] You do not need to refresh pages to see new comments, status changes or stock levels — they appear by themselves.`,
  },
  {
    slug: 'procurement-and-spending-policy',
    category: 'policies',
    title: 'Procurement and spending policy',
    summary: 'Approval thresholds, preferred suppliers and what must go through a purchase request.',
    tags: ['procurement', 'approval', 'budget', 'purchase'],
    author: 'indah.permatasari@arunika.co.id',
    daysAgo: 90,
    body: `## Scope

This policy applies to every purchase of goods or services paid by Arunika Group, regardless of amount.

## Approval thresholds

| Amount (IDR) | Required approval |
| --- | --- |
| Up to 5,000,000 | Line manager |
| 5,000,001 – 50,000,000 | Head of department |
| Above 50,000,000 | Head of department and CFO |

Splitting a purchase into smaller requests to avoid a threshold is a policy breach.

## Preferred suppliers

Use the framework suppliers listed by Procurement whenever possible. They have agreed pricing, delivery terms and invoicing. A non-framework supplier needs **two comparable quotations** attached to the request.

## Stocked items first

Before requesting a purchase, check the [Products](/products) catalogue. Laptops, monitors, peripherals, PPE and consumables are usually held in stock and can be issued faster through an **Equipment Request**.

> [!WARNING] Purchases made outside FlowDesk without approval will not be reimbursed.`,
  },
  {
    slug: 'travel-and-expense-policy',
    category: 'policies',
    title: 'Business travel and expense policy',
    summary: 'Booking rules, per-diem grades and how to claim reimbursement for business expenses.',
    tags: ['travel', 'expense', 'reimbursement', 'per-diem'],
    author: 'raka.pratama@arunika.co.id',
    daysAgo: 75,
    body: `## Booking travel

Raise a **Business Travel** request at least **7 days** before departure for domestic trips and **14 days** for international trips. Include the purpose, dates, destination and estimated cost.

- Economy class for flights under 6 hours.
- Hotels within the nightly cap for your grade.
- Airport transfers by taxi or ride-hailing; keep receipts.

## Per-diem grades

| Grade | Domestic per day | International per day |
| --- | --- | --- |
| A | Rp 750.000 | USD 90 |
| B | Rp 600.000 | USD 75 |
| C | Rp 450.000 | USD 60 |

## Claiming expenses

Submit an **Expense Reimbursement** request within **30 days** of the expense. Attach clear receipts (PDF or photo). Client entertainment must list attendees and the business purpose.

> [!NOTE] Reimbursements are paid in the next payroll cycle after the request is completed.`,
  },
  {
    slug: 'acceptable-use-and-access-policy',
    category: 'policies',
    title: 'Acceptable use and access policy',
    summary: 'Rules for company devices, accounts, shared drives and how access is granted and reviewed.',
    tags: ['security', 'access', 'it', 'devices'],
    author: 'admin@arunika.co.id',
    daysAgo: 120,
    body: `## Principles

Access is granted on a **least-privilege** basis: you get what your role needs, for as long as you need it.

## Requesting access

Use an **IT Access** request. State the system, the level of access, the reason and — for temporary access such as external auditors — the end date. The data owner or your manager must approve.

## Devices

- Company laptops must stay encrypted and enrolled in device management.
- Do not install unlicensed software. Request licences through a **Software License** request.
- Report lost or stolen devices to IT immediately.

## Reviews

Access to finance systems and the data warehouse is reviewed quarterly. Unused access is removed.

> [!WARNING] Never share passwords or MFA codes — not even with IT. The service desk will never ask for them.`,
  },
  {
    slug: 'workplace-safety-policy',
    category: 'policies',
    title: 'Workplace safety (K3) policy for distribution centres',
    summary:
      'Mandatory PPE, site induction and incident reporting at the Cikarang and Surabaya distribution centres.',
    tags: ['safety', 'k3', 'warehouse', 'ppe'],
    author: 'daniel.sitorus@arunika.co.id',
    daysAgo: 100,
    body: `## Mandatory PPE

Everyone on a distribution centre floor — staff, contractors and visitors — must wear:

- a **safety helmet** in racking zones
- a **hi-vis vest** at all times
- **S3 safety boots** in loading areas

PPE is issued from stock. Operations raises an **Equipment Request** for new joiners as part of onboarding.

## Site induction

New staff complete the site induction before their first shift. Seasonal staff receive the same induction.

## First aid

Each floor holds a K3-standard first aid kit. Kits are inspected monthly; expired kits are replaced through a purchase request.

## Incident reporting

Report every incident and near-miss to the shift supervisor the same day. Serious incidents are escalated to the Head of Operations immediately.`,
  },
  {
    slug: 'how-requests-are-approved',
    category: 'procedures',
    title: 'How requests are reviewed and approved',
    summary:
      'The workflow states, who can move a request between them, and what makes a request easy to approve.',
    tags: ['workflow', 'approval', 'requests', 'review'],
    author: 'daniel.sitorus@arunika.co.id',
    daysAgo: 50,
    body: `## Workflow states

| State | Who acts next |
| --- | --- |
| Draft | Requester |
| Submitted | Manager starts the review |
| Under review | Manager approves, rejects or requests changes |
| Changes requested | Requester edits and resubmits |
| Approved | Operations starts processing |
| Processing | Operations completes |
| Completed / Rejected | Closed |

The system only allows valid moves. A completed request can never return to draft, and a rejection always needs a reason.

## Writing a request that gets approved quickly

1. Use a specific title: *"Second monitor for reconciliation work"* beats *"Monitor"*.
2. Explain the business reason and any deadline.
3. Include the cost centre and delivery location.
4. Attach quotations for purchases outside the catalogue.

## Service levels

Each request type has a target in working days (for example, IT Access is 2 days and Purchase Requests are 7). The due date defaults to that target when you leave it empty.

> [!TIP] Managers see a "Pending approvals" count on the Overview — keeping requests specific helps them clear it quickly.`,
  },
  {
    slug: 'recording-inventory-movements',
    category: 'procedures',
    title: 'Recording inventory movements',
    summary: 'Receipts, issues, returns and stock counts — how operations keeps stock levels accurate.',
    tags: ['inventory', 'stock', 'operations', 'warehouse'],
    author: 'bayu.santoso@arunika.co.id',
    daysAgo: 35,
    body: `## Movement types

| Type | Effect | Use it when |
| --- | --- | --- |
| Receipt | Adds stock | Goods arrive from a supplier |
| Issue | Removes stock | Items are handed out for a request |
| Return | Adds stock | Unused items come back |
| Stock count | Sets the quantity | A physical count differs from the system |

Every movement records who made it, when, and the before and after quantities.

## Rules the system enforces

- Stock can never go below zero. Issuing more than is available is rejected.
- A stock count always needs a reason.
- Discontinued products cannot receive new stock.

## Thresholds

Each product has a **reorder threshold**. When stock falls to or below it the product becomes **Low stock**; at zero it is **Out of stock**. Operations and admins are notified automatically and the Monitor highlights the product.

> [!NOTE] Reference the request number in the reason (for example *"Issued for #1042"*) so the movement can be traced back.`,
  },
  {
    slug: 'year-end-stock-take',
    category: 'procedures',
    title: 'Year-end stock take procedure',
    summary: 'Preparing for, running and reconciling the annual physical stock count.',
    tags: ['inventory', 'stock-take', 'finance', 'audit'],
    author: 'dewi.lestari@arunika.co.id',
    daysAgo: 20,
    body: `## Before the count

1. Freeze issues and receipts from 18:00 the day before.
2. Print count sheets per zone or use the rugged handhelds.
3. Assign two counters per zone — one counts, one verifies.

## During the count

- Count every location, including the returns cage.
- Record damaged items separately; they are written off, not counted as stock.

## Reconciliation

For each product where the count differs from FlowDesk, record a **Stock count** movement with the counted quantity and the reason *"Year-end stock take"*. Differences above 5% of the expected quantity need a note from the zone lead.

Finance reviews the variance report from the audit log, filtered by the action **INVENTORY_CHANGED** and the stock-take dates.`,
  },
  {
    slug: 'onboarding-a-new-joiner',
    category: 'procedures',
    title: 'Onboarding a new joiner',
    summary: 'What the hiring manager, People & Culture, IT and operations each do before day one.',
    tags: ['onboarding', 'hr', 'it', 'equipment'],
    author: 'maya.kusuma@arunika.co.id',
    daysAgo: 45,
    body: `## Timeline

| When | Who | What |
| --- | --- | --- |
| 10 working days before | Hiring manager | Raise an **Employee Onboarding** request |
| 7 days before | IT | Create accounts and prepare the laptop |
| 5 days before | Operations | Reserve equipment and workspace |
| Day one | People & Culture | Induction and policy briefing |

## What to include in the request

- Start date, role and department
- Required systems (ERP modules, CRM, shared drives)
- Equipment beyond the standard kit
- For distribution centres: PPE sizes and site induction slot

> [!TIP] The standard laptop build is listed in the Products catalogue as *Dell Latitude 5450 (Standard build)*.`,
  },
  {
    slug: 'standard-laptop-builds',
    category: 'product-documentation',
    title: 'Standard laptop builds',
    summary: 'Which laptop each role receives, what is pre-installed and how devices are secured.',
    tags: ['laptop', 'equipment', 'it', 'hardware'],
    author: 'fajar.nugroho@arunika.co.id',
    daysAgo: 30,
    body: `## Builds

| Build | Model | For |
| --- | --- | --- |
| Standard | Dell Latitude 5450 | Most roles |
| Finance | ThinkPad T14 Gen 5 | Finance and analytics |
| Creative | MacBook Air 13" M3 | Design and marketing |

## Pre-installed

- Microsoft 365 apps and Teams
- VPN client and endpoint protection
- Role-specific tools (ERP client, Power BI, Adobe suite for creative)

## Security

All laptops are encrypted, enrolled in device management and require MFA at sign-in. Lost devices can be wiped remotely.

## Replacement cycle

Laptops are replaced after four years or earlier if repair costs exceed 40% of a new device.`,
  },
  {
    slug: 'printer-consumables-guide',
    category: 'product-documentation',
    title: 'Printer consumables guide',
    summary: 'Which toner and drum fit which printer, page yields and when to reorder.',
    tags: ['printing', 'toner', 'consumables', 'inventory'],
    author: 'yusuf.hakim@arunika.co.id',
    daysAgo: 25,
    body: `## Compatibility

| Printer location | Toner | Drum |
| --- | --- | --- |
| Level 9 (2 units) | TN-760 | DR-730 |
| Level 12 | TN-760 | DR-730 |
| Reception | TN-760 | DR-730 |

## Yields

- **TN-760** toner: about 3,000 pages
- **DR-730** drum: about 12,000 pages (roughly every fourth toner)

## Reordering

Toner stock has a reorder threshold of 3 cartridges. Month-end reporting doubles print volume, so check stock in the last week of each month.

> [!WARNING] Do not use refilled cartridges — they void the printer service contract.`,
  },
  {
    slug: 'ppe-sizing-and-care',
    category: 'product-documentation',
    title: 'PPE sizing and care',
    summary: 'Sizing charts and care instructions for helmets, vests and safety boots.',
    tags: ['safety', 'ppe', 'warehouse', 'k3'],
    author: 'bayu.santoso@arunika.co.id',
    daysAgo: 70,
    body: `## Helmets

One size with a ratchet adjustment. Replace after any impact or after three years from the manufacture date printed inside the shell.

## Hi-vis vests

| Size | Chest (cm) |
| --- | --- |
| M | 96–104 |
| L | 104–112 |
| XL | 112–120 |
| XXL | 120–128 |

Wash at 40°C. Replace when reflective strips crack or fade.

## Safety boots

Available in sizes 38–46. Replace when the sole tread is worn smooth or the toe cap is exposed.`,
  },
  {
    slug: 'meeting-room-equipment',
    category: 'product-documentation',
    title: 'Meeting room audio and video equipment',
    summary: 'Displays, speakerphones and webcams in meeting rooms, and how to request upgrades.',
    tags: ['meeting', 'audio', 'video', 'conferencing'],
    author: 'rizky.ramadhan@arunika.co.id',
    daysAgo: 15,
    body: `## Standard room kit

- 55" 4K display with a USB-C to HDMI adapter
- Conference speakerphone for rooms up to 10 people
- 1080p webcam mounted above the display

## Connecting

Plug in the USB-C cable on the table. The display, camera and speakerphone appear automatically in Teams and Zoom.

## Problems

If audio is echoing, make sure only one device in the room has its microphone enabled. For faults, raise a **Facilities Maintenance** request with the room name.`,
  },
  {
    slug: 'faq-requests',
    category: 'faqs',
    title: 'FAQ: requests',
    summary: 'Editing submitted requests, due dates, cancelling, and why a request was sent back.',
    tags: ['faq', 'requests', 'workflow'],
    author: 'dewi.lestari@arunika.co.id',
    daysAgo: 12,
    body: `## Can I edit a request after submitting it?

Not while it is being reviewed. If the reviewer requests changes, the request comes back to you and you can edit and resubmit it.

## How do I cancel a request?

Drafts can be deleted by the requester. For submitted requests, add a comment asking the reviewer to reject it with the reason "No longer needed".

## Why was my due date set automatically?

When you leave the due date empty, FlowDesk uses the service level of the request type.

## Who can see my request?

You, anyone assigned to it, and managers, operations and administrators.

## Can I attach files?

Yes — PDF, images, Word, Excel, PowerPoint, CSV and text files up to 10 MB each.`,
  },
  {
    slug: 'faq-account-and-sign-in',
    category: 'faqs',
    title: 'FAQ: account and sign-in',
    summary: 'Password rules, session timeouts, signing out other devices and lockouts.',
    tags: ['faq', 'account', 'password', 'security'],
    author: 'admin@arunika.co.id',
    daysAgo: 8,
    body: `## How long does my session last?

You are signed out after 8 hours without activity, and every session ends after 7 days at the latest.

## How do I sign out a device I no longer use?

Open **Account → Active sessions** and choose **Sign out** next to the device.

## What makes a valid password?

At least 10 characters, mixing letters with numbers or symbols. Changing your password signs out all your other sessions.

## I am locked out after too many attempts

Sign-in is rate limited to protect your account. Wait 15 minutes and try again, or contact IT.`,
  },
  {
    slug: 'faq-inventory-and-stock',
    category: 'faqs',
    title: 'FAQ: inventory and stock',
    summary: 'What low stock means, why an issue was rejected, and how stock appears on the Monitor.',
    tags: ['faq', 'inventory', 'stock'],
    author: 'bayu.santoso@arunika.co.id',
    daysAgo: 5,
    body: `## What does "Low stock" mean?

The quantity is at or below the product's reorder threshold. It is a signal to reorder, not an error.

## Why was my stock issue rejected?

You tried to issue more units than are in stock. Stock can never become negative. Record a receipt first if goods have arrived.

## Why do I see stock change while I am looking at a product?

Someone else recorded a movement. The page updates live — there is no need to refresh.

## Can I change stock by editing the product?

No. Stock only changes through recorded movements, so there is always a history.`,
  },
];
