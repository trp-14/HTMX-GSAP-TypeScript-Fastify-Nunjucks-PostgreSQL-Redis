import type { Role } from '../../auth/permissions.js';
import type { Priority } from '../../repositories/requestRepository.js';

/** Demo organisation: Arunika Group, a fictional Jakarta-based distribution company. */

export const DEPARTMENTS = [
  { code: 'FIN', name: 'Finance' },
  { code: 'PNC', name: 'People & Culture' },
  { code: 'IT', name: 'Information Technology' },
  { code: 'OPS', name: 'Operations' },
  { code: 'PRC', name: 'Procurement' },
  { code: 'FAC', name: 'Facilities' },
  { code: 'SAL', name: 'Sales' },
  { code: 'MKT', name: 'Marketing' },
  { code: 'LEG', name: 'Legal & Compliance' },
] as const;

export type SeedUser = {
  email: string;
  fullName: string;
  title: string;
  dept: string;
  roles: Role[];
  active?: boolean;
};

export const USERS: SeedUser[] = [
  {
    email: 'admin@arunika.co.id',
    fullName: 'Nadia Rahmawati',
    title: 'Head of IT Governance',
    dept: 'IT',
    roles: ['ADMIN'],
  },
  {
    email: 'sinta.wirawan@arunika.co.id',
    fullName: 'Sinta Wirawan',
    title: 'Financial Analyst',
    dept: 'FIN',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'raka.pratama@arunika.co.id',
    fullName: 'Raka Pratama',
    title: 'Finance Manager',
    dept: 'FIN',
    roles: ['MANAGER'],
  },
  {
    email: 'dewi.lestari@arunika.co.id',
    fullName: 'Dewi Lestari',
    title: 'Operations Coordinator',
    dept: 'OPS',
    roles: ['OPERATIONS'],
  },
  {
    email: 'bayu.santoso@arunika.co.id',
    fullName: 'Bayu Santoso',
    title: 'Warehouse Lead',
    dept: 'OPS',
    roles: ['OPERATIONS'],
  },
  {
    email: 'fajar.nugroho@arunika.co.id',
    fullName: 'Fajar Nugroho',
    title: 'IT Support Specialist',
    dept: 'IT',
    roles: ['OPERATIONS'],
  },
  {
    email: 'maya.kusuma@arunika.co.id',
    fullName: 'Maya Kusuma',
    title: 'HR Business Partner',
    dept: 'PNC',
    roles: ['MANAGER'],
  },
  {
    email: 'andi.setiawan@arunika.co.id',
    fullName: 'Andi Setiawan',
    title: 'Account Executive',
    dept: 'SAL',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'putri.anggraini@arunika.co.id',
    fullName: 'Putri Anggraini',
    title: 'Content Strategist',
    dept: 'MKT',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'hendra.wijaya@arunika.co.id',
    fullName: 'Hendra Wijaya',
    title: 'Regional Sales Manager',
    dept: 'SAL',
    roles: ['MANAGER'],
  },
  {
    email: 'rina.halim@arunika.co.id',
    fullName: 'Rina Halim',
    title: 'Compliance Officer',
    dept: 'LEG',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'yusuf.hakim@arunika.co.id',
    fullName: 'Yusuf Hakim',
    title: 'Facilities Supervisor',
    dept: 'FAC',
    roles: ['OPERATIONS'],
  },
  {
    email: 'larasati.putri@arunika.co.id',
    fullName: 'Larasati Putri',
    title: 'Procurement Specialist',
    dept: 'PRC',
    roles: ['OPERATIONS'],
  },
  {
    email: 'michael.tanoto@arunika.co.id',
    fullName: 'Michael Tanoto',
    title: 'Software Engineer',
    dept: 'IT',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'grace.simanjuntak@arunika.co.id',
    fullName: 'Grace Simanjuntak',
    title: 'Marketing Manager',
    dept: 'MKT',
    roles: ['MANAGER'],
  },
  {
    email: 'arief.budiman@arunika.co.id',
    fullName: 'Arief Budiman',
    title: 'Logistics Analyst',
    dept: 'OPS',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'citra.maharani@arunika.co.id',
    fullName: 'Citra Maharani',
    title: 'Talent Acquisition Specialist',
    dept: 'PNC',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'kevin.gunawan@arunika.co.id',
    fullName: 'Kevin Gunawan',
    title: 'Accounts Payable Officer',
    dept: 'FIN',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'ayu.pertiwi@arunika.co.id',
    fullName: 'Ayu Pertiwi',
    title: 'Legal Counsel',
    dept: 'LEG',
    roles: ['MANAGER'],
  },
  {
    email: 'rizky.ramadhan@arunika.co.id',
    fullName: 'Rizky Ramadhan',
    title: 'Network Engineer',
    dept: 'IT',
    roles: ['OPERATIONS'],
  },
  {
    email: 'wulan.sari@arunika.co.id',
    fullName: 'Wulan Sari',
    title: 'Sales Operations Analyst',
    dept: 'SAL',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'teguh.prasetyo@arunika.co.id',
    fullName: 'Teguh Prasetyo',
    title: 'Office Administrator',
    dept: 'FAC',
    roles: ['EMPLOYEE'],
  },
  {
    email: 'indah.permatasari@arunika.co.id',
    fullName: 'Indah Permatasari',
    title: 'Head of Procurement',
    dept: 'PRC',
    roles: ['MANAGER'],
  },
  {
    email: 'daniel.sitorus@arunika.co.id',
    fullName: 'Daniel Sitorus',
    title: 'Head of Operations',
    dept: 'OPS',
    roles: ['MANAGER', 'OPERATIONS'],
  },
  {
    email: 'lina.marlina@arunika.co.id',
    fullName: 'Lina Marlina',
    title: 'Tax Specialist',
    dept: 'FIN',
    roles: ['EMPLOYEE'],
    active: false,
  },
];

export const REQUEST_TYPES = [
  {
    code: 'PURCHASE',
    name: 'Purchase Request',
    sla: 7,
    description: 'Goods or services that need a purchase order from Procurement.',
  },
  {
    code: 'IT_ACCESS',
    name: 'IT Access',
    sla: 2,
    description: 'Access to systems, shared drives, VPN or elevated permissions.',
  },
  {
    code: 'EQUIPMENT',
    name: 'Equipment Request',
    sla: 5,
    description: 'Laptops, monitors, peripherals and other stocked equipment.',
  },
  {
    code: 'TRAVEL',
    name: 'Business Travel',
    sla: 5,
    description: 'Flights, hotels and per-diem for business trips.',
  },
  {
    code: 'FACILITIES',
    name: 'Facilities Maintenance',
    sla: 3,
    description: 'Repairs, cleaning, seating and workspace changes.',
  },
  {
    code: 'EXPENSE',
    name: 'Expense Reimbursement',
    sla: 7,
    description: 'Reimbursement of approved out-of-pocket business expenses.',
  },
  {
    code: 'SOFTWARE',
    name: 'Software License',
    sla: 4,
    description: 'New or additional seats for licensed software.',
  },
  {
    code: 'ONBOARDING',
    name: 'Employee Onboarding',
    sla: 10,
    description: 'Accounts, equipment and workspace for a new joiner.',
  },
] as const;

type RequestTemplate = {
  type: (typeof REQUEST_TYPES)[number]['code'];
  title: string;
  description: string;
  priority: Priority;
};

/** Realistic request content. `{who}` is replaced with the requester's first name where useful. */
export const REQUEST_TEMPLATES: RequestTemplate[] = [
  {
    type: 'EQUIPMENT',
    title: 'Laptop for new finance analyst',
    priority: 'HIGH',
    description:
      'Our new financial analyst joins on Monday and needs a standard finance laptop (16 GB RAM, Excel power-user build) with the consolidation model add-ins installed.\n\nCost centre: FIN-210. Please deliver to Level 12, desk 12-08.',
  },
  {
    type: 'PURCHASE',
    title: 'Replacement toner for Level 9 printers',
    priority: 'MEDIUM',
    description:
      'Both printers on Level 9 are showing low toner warnings. We print month-end packs next week, so we need four TN-760 cartridges before the 25th.',
  },
  {
    type: 'IT_ACCESS',
    title: 'VPN access for external auditors',
    priority: 'URGENT',
    description:
      'The KAP audit team (3 people) starts fieldwork on Wednesday and needs read-only VPN access to the finance share and the ERP reporting module for two weeks.\n\nAccess should expire automatically at the end of the engagement.',
  },
  {
    type: 'FACILITIES',
    title: 'Air conditioning failure in meeting room Merapi',
    priority: 'HIGH',
    description:
      'The AC unit in meeting room Merapi (Level 7) has stopped cooling. The room reaches 31°C by midday and we have client workshops booked there all week.',
  },
  {
    type: 'TRAVEL',
    title: 'Surabaya distributor visit — flights and hotel',
    priority: 'MEDIUM',
    description:
      'Quarterly business review with our East Java distributors. Return flights CGK–SUB on the 14th and 16th, two nights near Tunjungan. Budget per policy grade C.',
  },
  {
    type: 'EXPENSE',
    title: 'Reimbursement — client dinner with Mitra Logistik',
    priority: 'LOW',
    description:
      'Dinner with the Mitra Logistik procurement team after contract signing. Receipt attached; total Rp 2.850.000 for 6 people, within the entertainment policy limit.',
  },
  {
    type: 'SOFTWARE',
    title: 'Figma Professional seats for marketing',
    priority: 'MEDIUM',
    description:
      'We need two additional Figma Professional seats for the new campaign designers. Annual billing preferred; existing workspace is under the marketing account.',
  },
  {
    type: 'ONBOARDING',
    title: 'Onboarding for warehouse supervisor (Cikarang)',
    priority: 'HIGH',
    description:
      'New warehouse supervisor starts at the Cikarang DC on the 1st. Needs: email, WMS account, rugged handheld, safety kit (helmet, vest, boots size 42) and site induction.',
  },
  {
    type: 'EQUIPMENT',
    title: 'Second monitor for reconciliation work',
    priority: 'LOW',
    description:
      'Bank reconciliations involve comparing statements side by side. A second 27" monitor would save a lot of alt-tabbing. Standard model is fine.',
  },
  {
    type: 'PURCHASE',
    title: 'Safety vests and helmets for Q4 hiring',
    priority: 'HIGH',
    description:
      'Twelve seasonal warehouse staff join in Q4. Each needs a hi-vis vest and a safety helmet before their first shift — site rules do not allow exceptions.',
  },
  {
    type: 'IT_ACCESS',
    title: 'Admin rights to Power BI workspace',
    priority: 'MEDIUM',
    description:
      'I maintain the sales dashboards and need workspace admin rights to schedule refreshes and manage the gateway connection. Currently blocked on every change.',
  },
  {
    type: 'FACILITIES',
    title: 'Ergonomic chair assessment for sales team',
    priority: 'LOW',
    description:
      'Several people on the sales floor have reported back pain. Request an ergonomic assessment and replacement chairs where needed (estimated 6 chairs).',
  },
  {
    type: 'SOFTWARE',
    title: 'Adobe Acrobat Pro for contract redlining',
    priority: 'MEDIUM',
    description:
      'Legal needs Acrobat Pro to compare contract versions and apply redactions before sharing with counterparties. One seat for the compliance officer.',
  },
  {
    type: 'TRAVEL',
    title: 'Makassar branch audit trip',
    priority: 'MEDIUM',
    description:
      'Internal compliance review at the Makassar branch. Flights CGK–UPG, three nights accommodation and local transport for two people.',
  },
  {
    type: 'EQUIPMENT',
    title: 'Noise-cancelling headset for call-heavy role',
    priority: 'MEDIUM',
    description:
      'I spend most of the day on customer calls from the open-plan floor. A noise-cancelling headset with a boom mic would noticeably improve call quality.',
  },
  {
    type: 'PURCHASE',
    title: 'Wi-Fi access points for Level 5 expansion',
    priority: 'HIGH',
    description:
      'The Level 5 fit-out adds 40 desks. Network team recommends two additional Wi-Fi 6 access points plus a PoE switch to avoid congestion during peak hours.',
  },
  {
    type: 'EXPENSE',
    title: 'Reimbursement — trade show booth materials',
    priority: 'MEDIUM',
    description:
      'Printed banners and brochure stands purchased locally for the Jakarta Logistics Expo because the vendor shipment was delayed. Receipts total Rp 4.120.000.',
  },
  {
    type: 'IT_ACCESS',
    title: 'Shared drive access for new recruiter',
    priority: 'MEDIUM',
    description:
      'Please grant the new recruiter access to the Talent Acquisition shared drive and the ATS integration folder. Same permissions as the rest of the TA team.',
  },
  {
    type: 'FACILITIES',
    title: 'Repair broken lock on archive room',
    priority: 'URGENT',
    description:
      'The electronic lock on the Level 3 archive room is not engaging. The room holds signed contracts and personnel files and must be secured today.',
  },
  {
    type: 'ONBOARDING',
    title: 'Onboarding for two management trainees',
    priority: 'MEDIUM',
    description:
      'Two management trainees join the rotation programme. They need laptops, email, access to the LMS and a hot-desk booking for their first three months.',
  },
  {
    type: 'EQUIPMENT',
    title: 'Docking station for hybrid work setup',
    priority: 'LOW',
    description:
      'Requesting a USB-C docking station so I can connect to the shared monitors on hot-desk days without swapping cables.',
  },
  {
    type: 'SOFTWARE',
    title: 'Increase Zoom Webinar capacity for product launch',
    priority: 'HIGH',
    description:
      'The product launch webinar expects ~800 attendees; our current Zoom licence caps at 500. Need a one-month upgrade to the 1,000-attendee tier.',
  },
  {
    type: 'PURCHASE',
    title: 'Bulk A4 paper order for head office',
    priority: 'LOW',
    description:
      'Quarterly paper replenishment for head office printers: 60 reams of A4 80gsm. Please use the framework supplier to keep the agreed price.',
  },
  {
    type: 'TRAVEL',
    title: 'Singapore regional sales conference',
    priority: 'MEDIUM',
    description:
      'Attending the APAC regional sales conference. Flights CGK–SIN, two nights at the conference hotel and registration fee (already approved in the sales budget).',
  },
  {
    type: 'IT_ACCESS',
    title: 'Restore access after password lockout',
    priority: 'URGENT',
    description:
      'My account was locked after the forced password rotation and the self-service reset is failing with an MFA error. I cannot access email or the ERP.',
  },
  {
    type: 'FACILITIES',
    title: 'Deep cleaning after pantry leak',
    priority: 'MEDIUM',
    description:
      'A water leak in the Level 10 pantry soaked the carpet near the coffee station. Needs drying, deep cleaning and a check for mould behind the cabinets.',
  },
  {
    type: 'EQUIPMENT',
    title: 'Replacement keyboard and mouse',
    priority: 'LOW',
    description:
      'Several keys on my keyboard are sticking and the mouse scroll wheel is broken. Standard wireless set is fine.',
  },
  {
    type: 'EXPENSE',
    title: 'Reimbursement — certification exam fee',
    priority: 'LOW',
    description:
      'Passed the CISA exam; requesting reimbursement of the exam fee under the professional development policy. Certificate and receipt attached.',
  },
  {
    type: 'SOFTWARE',
    title: 'Tableau Creator licence renewal',
    priority: 'MEDIUM',
    description:
      'Our Tableau Creator licence expires at month end. Renewal for one year; usage report shows weekly use for the logistics KPI pack.',
  },
  {
    type: 'PURCHASE',
    title: 'Conference speakerphone for board room',
    priority: 'MEDIUM',
    description:
      'Remote participants struggle to hear in the board room. Request a ceiling or tabletop speakerphone compatible with Teams Rooms.',
  },
  {
    type: 'ONBOARDING',
    title: 'Onboarding for senior legal counsel',
    priority: 'HIGH',
    description:
      'Senior legal counsel joins next month. Standard onboarding plus access to the contract management system and a lockable cabinet for privileged documents.',
  },
  {
    type: 'IT_ACCESS',
    title: 'ERP approval role for regional manager',
    priority: 'HIGH',
    description:
      'Following my promotion I need the ERP purchase approval role for the West Java region, with a spending limit aligned to the delegation-of-authority matrix.',
  },
  {
    type: 'FACILITIES',
    title: 'Additional standing desks for analytics pod',
    priority: 'LOW',
    description:
      'The analytics pod would like three height-adjustable desks to rotate between. Floor plan allows it near the window row.',
  },
  {
    type: 'TRAVEL',
    title: 'Medan customer onboarding visit',
    priority: 'HIGH',
    description:
      'On-site onboarding for a new key account in Medan. Flights CGK–KNO, two nights, and car rental for warehouse visits in Belawan.',
  },
  {
    type: 'EQUIPMENT',
    title: 'Rugged handhelds for stock counts',
    priority: 'HIGH',
    description:
      'Three of our handheld scanners failed during the last cycle count. Need replacements before the year-end stock take.',
  },
  {
    type: 'EXPENSE',
    title: 'Reimbursement — courier for urgent contract',
    priority: 'LOW',
    description:
      'Same-day courier to deliver a signed contract original to the notary in Bandung. Receipt Rp 650.000.',
  },
  {
    type: 'SOFTWARE',
    title: 'Password manager business seats',
    priority: 'MEDIUM',
    description:
      'Security recommends moving the finance team from spreadsheets to a password manager. Requesting 12 business seats.',
  },
  {
    type: 'PURCHASE',
    title: 'First aid kits for distribution centres',
    priority: 'MEDIUM',
    description:
      'Annual safety inspection flagged expired first aid kits at both DCs. Need eight complete kits that meet the K3 standard.',
  },
  {
    type: 'IT_ACCESS',
    title: 'Read access to customer data warehouse',
    priority: 'MEDIUM',
    description:
      'For the churn analysis project I need read-only access to the customer schema in the data warehouse. Data owner has agreed by email.',
  },
  {
    type: 'FACILITIES',
    title: 'Replace flickering lights in Level 4 corridor',
    priority: 'LOW',
    description:
      'Several fluorescent tubes in the Level 4 corridor are flickering. Ideally replace with LED panels like the rest of the floor.',
  },
  {
    type: 'EQUIPMENT',
    title: 'Webcam for interview room',
    priority: 'MEDIUM',
    description:
      'The interview room laptop camera is low quality for video interviews. Request a 1080p webcam that can be mounted on the screen.',
  },
  {
    type: 'ONBOARDING',
    title: 'Onboarding for customer success associate',
    priority: 'MEDIUM',
    description:
      'New customer success associate joins the sales team. Needs CRM access, laptop, headset and a buddy assigned for the first two weeks.',
  },
];

export type SeedCategory = { slug: string; name: string; art: string; hue: number; description: string };

export const PRODUCT_CATEGORIES: SeedCategory[] = [
  {
    slug: 'computers',
    name: 'Laptops & Computers',
    art: 'laptop',
    hue: 212,
    description: 'Standard-issue laptops and desktop computers.',
  },
  {
    slug: 'displays',
    name: 'Displays',
    art: 'monitor',
    hue: 248,
    description: 'Monitors and presentation displays.',
  },
  {
    slug: 'peripherals',
    name: 'Peripherals',
    art: 'keyboard',
    hue: 275,
    description: 'Keyboards, mice, docks and adapters.',
  },
  {
    slug: 'audio',
    name: 'Audio & Conferencing',
    art: 'headset',
    hue: 190,
    description: 'Headsets, webcams and meeting room audio.',
  },
  {
    slug: 'networking',
    name: 'Networking',
    art: 'router',
    hue: 160,
    description: 'Access points, switches and cabling.',
  },
  {
    slug: 'furniture',
    name: 'Office Furniture',
    art: 'chair',
    hue: 28,
    description: 'Chairs, desks and storage.',
  },
  {
    slug: 'printing',
    name: 'Printing & Consumables',
    art: 'printer',
    hue: 330,
    description: 'Printers, toner and drums.',
  },
  {
    slug: 'safety',
    name: 'Safety Equipment',
    art: 'helmet',
    hue: 45,
    description: 'PPE and site safety equipment for distribution centres.',
  },
  {
    slug: 'stationery',
    name: 'Stationery',
    art: 'paper',
    hue: 62,
    description: 'Paper, filing and everyday office supplies.',
  },
  {
    slug: 'licenses',
    name: 'Software Licenses',
    art: 'license',
    hue: 140,
    description: 'Pre-purchased software seats held in inventory.',
  },
  {
    slug: 'mobile',
    name: 'Mobile Devices',
    art: 'phone',
    hue: 200,
    description: 'Phones and rugged handheld scanners.',
  },
];

export type SeedProduct = {
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  threshold: number;
  status?: 'ACTIVE' | 'INACTIVE' | 'DISCONTINUED';
  description: string;
};

export const PRODUCTS: SeedProduct[] = [
  {
    sku: 'IT-LAP-014',
    name: 'ThinkPad T14 Gen 5 (Finance build)',
    category: 'computers',
    price: 21_500_000,
    stock: 14,
    threshold: 4,
    description:
      'Intel Core Ultra 7, 16 GB RAM, 512 GB SSD. Pre-imaged with the finance toolset and BitLocker enabled.',
  },
  {
    sku: 'IT-LAP-016',
    name: 'MacBook Air 13" M3',
    category: 'computers',
    price: 19_999_000,
    stock: 5,
    threshold: 3,
    description:
      'For design and marketing roles. 16 GB unified memory, 512 GB SSD, enrolled in device management.',
  },
  {
    sku: 'IT-LAP-022',
    name: 'Dell Latitude 5450 (Standard build)',
    category: 'computers',
    price: 16_750_000,
    stock: 3,
    threshold: 5,
    description: 'Default laptop for most roles. Core Ultra 5, 16 GB RAM, 256 GB SSD.',
  },
  {
    sku: 'IT-DSK-003',
    name: 'OptiPlex Micro Desktop',
    category: 'computers',
    price: 11_200_000,
    stock: 0,
    threshold: 2,
    description: 'Small-form-factor desktop for reception and warehouse offices.',
  },
  {
    sku: 'DSP-27-QHD',
    name: '27" QHD Monitor (USB-C)',
    category: 'displays',
    price: 5_490_000,
    stock: 22,
    threshold: 6,
    description: '27-inch IPS, 2560×1440, single-cable USB-C with 65 W charging.',
  },
  {
    sku: 'DSP-24-FHD',
    name: '24" Full HD Monitor',
    category: 'displays',
    price: 2_350_000,
    stock: 9,
    threshold: 6,
    description: 'Standard second screen for hot desks. Height-adjustable stand.',
  },
  {
    sku: 'DSP-55-MTG',
    name: '55" Meeting Room Display',
    category: 'displays',
    price: 14_900_000,
    stock: 1,
    threshold: 1,
    description: '4K commercial display with wall mount, for meeting room upgrades.',
  },
  {
    sku: 'PER-KB-WL',
    name: 'Wireless Keyboard & Mouse Set',
    category: 'peripherals',
    price: 685_000,
    stock: 41,
    threshold: 10,
    description: 'Quiet wireless keyboard and mouse with a shared USB receiver.',
  },
  {
    sku: 'PER-DOCK-C',
    name: 'USB-C Docking Station',
    category: 'peripherals',
    price: 3_150_000,
    stock: 7,
    threshold: 8,
    description: 'Dual display, 100 W pass-through, gigabit Ethernet. Compatible with all standard laptops.',
  },
  {
    sku: 'PER-ADP-HD',
    name: 'USB-C to HDMI Adapter',
    category: 'peripherals',
    price: 245_000,
    stock: 63,
    threshold: 15,
    description: '4K60 adapter for presenting in meeting rooms.',
  },
  {
    sku: 'AUD-HS-ANC',
    name: 'Noise-Cancelling Headset',
    category: 'audio',
    price: 2_890_000,
    stock: 11,
    threshold: 5,
    description: 'Over-ear ANC headset with boom mic, certified for Teams.',
  },
  {
    sku: 'AUD-CAM-1080',
    name: '1080p Webcam',
    category: 'audio',
    price: 1_150_000,
    stock: 2,
    threshold: 4,
    description: 'Full HD webcam with privacy shutter and dual microphones.',
  },
  {
    sku: 'AUD-SPK-CONF',
    name: 'Conference Speakerphone',
    category: 'audio',
    price: 4_600_000,
    stock: 4,
    threshold: 2,
    description: 'Tabletop speakerphone for rooms up to 10 people.',
  },
  {
    sku: 'NET-AP-W6',
    name: 'Wi-Fi 6 Access Point',
    category: 'networking',
    price: 6_400_000,
    stock: 6,
    threshold: 2,
    description: 'Ceiling-mount Wi-Fi 6 access point, PoE powered, managed via the cloud controller.',
  },
  {
    sku: 'NET-SW-24P',
    name: '24-Port PoE Switch',
    category: 'networking',
    price: 12_800_000,
    stock: 2,
    threshold: 1,
    description: 'Managed gigabit switch with 370 W PoE budget.',
  },
  {
    sku: 'NET-CBL-C6',
    name: 'Cat6 Patch Cable 2m (pack of 10)',
    category: 'networking',
    price: 310_000,
    stock: 18,
    threshold: 5,
    description: 'Snagless Cat6 patch cables for desks and racks.',
  },
  {
    sku: 'FUR-CHR-ERG',
    name: 'Ergonomic Task Chair',
    category: 'furniture',
    price: 4_250_000,
    stock: 8,
    threshold: 4,
    description: 'Adjustable lumbar support, seat depth and 4D arms. Mesh back.',
  },
  {
    sku: 'FUR-DSK-SIT',
    name: 'Height-Adjustable Desk 140cm',
    category: 'furniture',
    price: 7_800_000,
    stock: 2,
    threshold: 2,
    description: 'Dual-motor sit-stand desk with memory presets.',
  },
  {
    sku: 'FUR-CAB-LCK',
    name: 'Lockable Pedestal Cabinet',
    category: 'furniture',
    price: 1_950_000,
    stock: 12,
    threshold: 3,
    description: 'Three-drawer steel pedestal with central lock.',
  },
  {
    sku: 'PRN-TN-760',
    name: 'Toner Cartridge TN-760',
    category: 'printing',
    price: 1_290_000,
    stock: 10,
    threshold: 3,
    description: 'High-yield black toner (3,000 pages) for the Level 9 and Level 12 printers.',
  },
  {
    sku: 'PRN-DR-730',
    name: 'Drum Unit DR-730',
    category: 'printing',
    price: 1_640_000,
    stock: 3,
    threshold: 2,
    description: 'Replacement drum unit, approx. 12,000 pages.',
  },
  {
    sku: 'PRN-MFP-A4',
    name: 'A4 Multifunction Printer',
    category: 'printing',
    price: 9_750_000,
    stock: 1,
    threshold: 1,
    status: 'INACTIVE',
    description: 'Network MFP with duplex scanning. Currently on hold pending the managed print tender.',
  },
  {
    sku: 'SAF-HLM-WHT',
    name: 'Safety Helmet (White)',
    category: 'safety',
    price: 145_000,
    stock: 26,
    threshold: 15,
    description: 'SNI-certified safety helmet with ratchet adjustment.',
  },
  {
    sku: 'SAF-VST-HV',
    name: 'Hi-Vis Safety Vest',
    category: 'safety',
    price: 85_000,
    stock: 9,
    threshold: 15,
    description: 'Reflective vest, sizes M–XXL, required on all DC floors.',
  },
  {
    sku: 'SAF-FAK-K3',
    name: 'First Aid Kit (K3 Standard)',
    category: 'safety',
    price: 650_000,
    stock: 0,
    threshold: 4,
    description: 'Workplace first aid kit compliant with the K3 regulation.',
  },
  {
    sku: 'SAF-BOOT-S3',
    name: 'Safety Boots S3',
    category: 'safety',
    price: 720_000,
    stock: 14,
    threshold: 6,
    description: 'Steel toe cap, anti-slip sole. Sizes 38–46.',
  },
  {
    sku: 'STA-A4-80',
    name: 'A4 Paper 80gsm (ream)',
    category: 'stationery',
    price: 52_000,
    stock: 140,
    threshold: 40,
    description: '500 sheets per ream, framework supplier pricing.',
  },
  {
    sku: 'STA-BND-A4',
    name: 'Lever Arch Files (box of 10)',
    category: 'stationery',
    price: 210_000,
    stock: 6,
    threshold: 5,
    description: 'A4 lever arch files for audit and contract archives.',
  },
  {
    sku: 'STA-NB-A5',
    name: 'Branded Notebook A5',
    category: 'stationery',
    price: 48_000,
    stock: 85,
    threshold: 20,
    status: 'DISCONTINUED',
    description: 'Previous brand identity — being phased out after the rebrand.',
  },
  {
    sku: 'LIC-M365-E3',
    name: 'Microsoft 365 E3 Seat (annual)',
    category: 'licenses',
    price: 5_100_000,
    stock: 17,
    threshold: 5,
    description: 'Pre-purchased annual seats held for new joiners.',
  },
  {
    sku: 'LIC-ADOBE-PRO',
    name: 'Adobe Acrobat Pro Seat (annual)',
    category: 'licenses',
    price: 3_400_000,
    stock: 2,
    threshold: 2,
    description: 'PDF editing, redaction and comparison.',
  },
  {
    sku: 'LIC-FIGMA-PRO',
    name: 'Figma Professional Seat (annual)',
    category: 'licenses',
    price: 2_600_000,
    stock: 4,
    threshold: 2,
    description: 'Design collaboration seat for the marketing workspace.',
  },
  {
    sku: 'MOB-PHN-STD',
    name: 'Company Smartphone (Standard)',
    category: 'mobile',
    price: 6_999_000,
    stock: 7,
    threshold: 3,
    description: 'Managed Android smartphone for field sales and operations.',
  },
  {
    sku: 'MOB-HH-RGD',
    name: 'Rugged Handheld Scanner',
    category: 'mobile',
    price: 18_400_000,
    stock: 1,
    threshold: 3,
    description: 'Android handheld with 2D imager for warehouse cycle counts.',
  },
];

export const COMMENT_POOL = {
  requester: [
    'Thanks — happy to provide anything else you need for this.',
    'Quick follow-up: is there an ETA? We have a deadline coming up at the end of the week.',
    'I have attached the quotation from the framework supplier.',
    'Updated the description with the cost centre and delivery location.',
    'Confirmed with my manager that this comes out of the current quarter budget.',
  ],
  manager: [
    'Approved in principle. Please make sure the cost centre is correct before processing.',
    'Can you confirm whether this was included in the quarterly budget forecast?',
    'Looks reasonable. Prioritising this because of the client deadline.',
    'Please attach the vendor quotation so Procurement can compare prices.',
    'This overlaps with a request from last month — checking whether we can reuse the stock.',
  ],
  operations: [
    'Picked up. Checking stock at the central store now.',
    'Stock reserved; delivery scheduled for tomorrow morning.',
    'Vendor confirmed lead time of three working days.',
    'Item issued from inventory — please confirm receipt.',
    'Coordinating with Facilities for installation on site.',
  ],
};

export const REJECTION_NOTES = [
  'This is not covered by the current budget. Please resubmit next quarter with a business case.',
  'Duplicate of an existing request — please follow the original instead.',
  'Policy does not allow this item for the role. Discuss alternatives with your manager.',
];

export const CHANGES_NOTES = [
  'Please add the cost centre and the expected delivery date.',
  'Attach the vendor quotation so Procurement can compare prices.',
  'Clarify how many people need access and for how long.',
  'Please split this into separate requests for hardware and software.',
];
