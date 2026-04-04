# 🎓 Alumni Tracker — Daily Project 4

**Akhmad Zamri Ardani | 202310370311406**  
**Rekayasa Kebutuhan A — Universitas Muhammadiyah Malang**

---

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![EJS](https://img.shields.io/badge/EJS-B4CA65?style=for-the-badge&logo=ejs&logoColor=black)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

> **Sistem Informasi Manajemen & Pelacakan Profil Publik Alumni Berbasis Web Terintegrasi Cloud**

---

## 📖 Deskripsi

**Alumni Tracker** adalah sistem informasi berbasis web yang dirancang untuk membantu admin institusi/kampus dalam melacak dan mengelola data jejak karir alumni secara terperinci.

Sistem ini dikembangkan pada *Daily Project 4* dengan penambahan:
- **11 titik data baru** (sosial media, pekerjaan, kontak lengkap)
- **Intelligent Tracker** — modul pelacakan otomatis berbasis sumber data publik
- **Pipeline verifikasi data** berbasis confidence score & cross-validation
- **Scheduler otomatis** untuk pelacakan berkala tanpa intervensi manual
- **Integrasi cloud database** via Supabase
- **Sistem autentikasi** berbasis session & password hashing

> ⚠️ Semua data bersifat privat dan digunakan **hanya untuk kepentingan pembelajaran**.

---

## ✨ Fitur Utama

### 1. 🗄️ Manajemen Profil Ekstensif
- **Kontak Pribadi** — Email & No. HP/WhatsApp
- **Sosial Media** — LinkedIn, Instagram, Facebook, TikTok
- **Informasi Karir** — Tempat kerja, posisi/jabatan, alamat kantor, sosmed kantor
- **Klasifikasi Pekerjaan** — PNS, Swasta, Wirausaha, dll. *(drop-down terstandarisasi)*

### 2. 🔐 Sistem Autentikasi Admin
- Semua route diproteksi via **Protected Routes**
- Manajemen sesi menggunakan `express-session`
- Password di-hash dengan `bcryptjs`
- Middleware autentikasi tersentralisasi di `src/middleware/auth.js`

### 3. 🤖 Intelligent Tracker *(BARU)*
Modul pelacakan otomatis berbasis sumber data publik yang valid:

| Komponen | Fungsi |
|---|---|
| **Query Builder** | Membentuk variasi nama + konteks pencarian (kampus, prodi, tahun lulus, lokasi) |
| **Scoring Engine** | Menghitung confidence score berdasarkan kecocokan multi-faktor (nama, edukasi, lokasi, pekerjaan) |
| **Disambiguator** | Mengklasifikasikan hasil: *Kemungkinan Kuat*, *Perlu Verifikasi Manual*, atau *Tidak Cocok* |
| **Cross-Validator** | Membandingkan temuan antar sumber untuk meningkatkan akurasi (+10% jika ≥2 sumber sepakat) |
| **Evidence Builder** | Menyimpan jejak bukti lengkap: link, ringkasan, tanggal, dan confidence score |
| **Scheduler** | Pelacakan berkala otomatis (configurable interval & batch size) |

**Sumber data publik yang dilacak:**
- 💼 LinkedIn — profil profesional
- 📄 Google Scholar — publikasi akademik
- 🔬 ResearchGate — profil riset
- 📸 Instagram — profil publik
- 👤 Facebook — profil publik

**Alur kerja:**
1. Sistem mengambil data alumni yang sudah ada *(tidak membuat data palsu)*
2. Membentuk query pencarian + variasi nama
3. Mengekstrak informasi dari sumber publik
4. Menghitung confidence score & klasifikasi otomatis
5. Cross-validation antar sumber
6. Admin me-review: **Approve** (data diperkaya ke profil alumni) atau **Reject** (tandai sebagai false positive)
7. Seluruh proses terekam untuk audit

### 4. 🔍 Verification Pipeline
- Staging area untuk data yang belum terverifikasi
- Side-by-side comparison: data asli vs data scraped
- Verifikasi manual oleh admin: **Approve / Reject**
- Data asli tidak pernah ditimpa sebelum diverifikasi *(audit-safe)*

### 5. ☁️ Cloud Database (Supabase)
- Migrasi dari local SQLite ke **PostgreSQL Cloud** via Supabase
- Memastikan ketersediaan data saat deployment ke Vercel

### 6. 📱 UI Responsif & Detail Modal
- Tampilan detail alumni via **popup modal** ter-animasi *(glassmorphism)*
- Responsif di desktop & mobile

---

## 🛠️ Teknologi

| Layer | Teknologi |
|---|---|
| **Frontend** | EJS (Embedded JS Templates), HTML5, CSS3, TailwindCSS (CDN) |
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (lokal) + Supabase PostgreSQL (cloud) |
| **Auth** | express-session, bcryptjs |
| **Tracking** | Custom tracker engine (query builder, scorer, disambiguator) |
| **Deployment** | Vercel |
| **Dev Tools** | nodemon, morgan, dotenv |

---

## 📂 Struktur Proyek

Menggunakan pola **Model-View-Controller (MVC)** yang diperluas dengan **Service Layer** untuk tracking:

```
📁 Daily Project 4/
├── 📁 src/
│   ├── 📁 config/
│   │   ├── auth.js             # Data akun & logika hashing password
│   │   ├── database.js         # Koneksi & abstraksi Supabase / SQLite
│   │   └── trackingDB.js       # Schema & CRUD tabel tracking (3 tabel)
│   ├── 📁 controllers/
│   │   ├── authController.js   # Handler login, logout
│   │   ├── alumniController.js # Logika bisnis CRUD & pipeline
│   │   └── trackerController.js # Handler intelligent tracker & dashboard
│   ├── 📁 middleware/
│   │   └── auth.js             # requireLogin — proteksi route
│   ├── 📁 models/
│   │   └── alumniModel.js      # Pemanggil fungsi abstraksi DB
│   ├── 📁 routes/
│   │   ├── alumniRoutes.js     # Rute data alumni & pipeline
│   │   └── trackerRoutes.js    # Rute intelligent tracker
│   └── 📁 services/
│       ├── trackerEngine.js    # Core: query builder, scorer, disambiguator
│       └── trackerScheduler.js # Scheduler pelacakan berkala otomatis
├── 📁 views/
│   ├── 📁 partials/
│   │   ├── header.ejs          # Navbar & head HTML
│   │   └── footer.ejs          # Footer global
│   ├── index.ejs               # Halaman utama — tabel data & detail modal
│   ├── form.ejs                # Form input/edit alumni (11 field)
│   ├── login.ejs               # Halaman autentikasi admin
│   ├── laporan.ejs             # Halaman laporan & statistik
│   ├── pipeline.ejs            # Dashboard verifikasi pipeline
│   └── tracker.ejs             # Dashboard intelligent tracker monitoring
├── 📁 public/
│   └── logo.png
├── 📁 import/                  # (di-gitignore) Script & data import Excel
├── .env                        # Secrets — tidak di-commit
├── .env.example                # Template konfigurasi
├── vercel.json                 # Konfigurasi deployment Vercel
├── package.json
├── index.js                    # Entry point server Node.js
└── README.md
```

---

## 🚀 Cara Menjalankan Secara Lokal

### 1. Clone Repositori

```bash
git clone https://github.com/kebabresing/DailyProject4.git
cd DailyProject4
```

### 2. Install Dependensi

```bash
npm install
```

### 3. Konfigurasi Environment

Buat file `.env` di root proyek (lihat `.env.example` sebagai referensi):

```properties
SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY
SESSION_SECRET=pilih_kalimat_rahasia_bebas
NODE_ENV=development
```

### 4. Jalankan Server

```bash
# Mode development (auto-restart saat ada perubahan)
npm run dev

# Mode production
npm start
```

### 5. Buka di Browser

```
http://localhost:3000
```

---

## 🧪 Pengujian Sistem (ISO 25010)

| No | Aspek Kualitas | Skenario Pengujian | Hasil yang Diharapkan | Status |
|:--|:--|:--|:--|:--:|
| 1 | **Security** | Akses `/data` sebelum login | Redirect otomatis ke `/login` | ✅ Lulus |
| 2 | **Security** | Bypass password dari backend | Password terlindungi hash `bcrypt` + salt | ✅ Lulus |
| 3 | **Functional Suitability** | CRUD 11 field alumni | Field `camelCase` terpetakan ke kolom `snake_case` DB | ✅ Lulus |
| 4 | **Usability** | Cek detail dari ratusan data | Modal popup menampilkan 18 kolom secara instan | ✅ Lulus |
| 5 | **Reliability** | Bot simulate di Vercel (cloud) | Tidak ada konflik filesystem, data aman di Supabase | ✅ Lulus |
| 6 | **Maintainability** | Penambahan modul tracker baru | Modul terisolasi di `services/` & `config/trackingDB.js`, tidak merusak sistem lama | ✅ Lulus |
| 7 | **Functional Suitability** | Tracker: Run Scan 10 alumni | Query builder, scorer, dan cross-validator berjalan; hasil tersimpan di DB tracking | ✅ Lulus |
| 8 | **Auditability** | Tracker: Lihat audit trail | Semua query pencarian, hasil, dan keputusan admin tersimpan sebagai evidence | ✅ Lulus |

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan akademik. Tidak untuk digunakan secara komersial.

---

<div align="center">
  <sub>Dibuat dengan ❤️ untuk Daily Project 4 — RPL UMM 2025</sub>
</div>
