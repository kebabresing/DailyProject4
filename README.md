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
- **Pipeline verifikasi data** berbasis confidence score
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

### 3. 🤖 Pipeline Verifikasi Data
- Simulasi bot pelacak alumni *(mocking API)*
- Sistem **confidence score** untuk setiap kandidat yang ditemukan
- Verifikasi manual oleh admin: **Approve / Reject**
- Data asli tidak pernah ditimpa sebelum diverifikasi *(audit-safe)*

### 4. ☁️ Cloud Database (Supabase)
- Migrasi dari local SQLite ke **PostgreSQL Cloud** via Supabase
- Memastikan ketersediaan data saat deployment ke Vercel *(no filesystem dependency)*

### 5. 📱 UI Responsif & Detail Modal
- Tampilan detail alumni via **popup modal** ter-animasi *(glassmorphism)*
- Responsif di desktop & mobile

---

## 🛠️ Teknologi

| Layer | Teknologi |
|---|---|
| **Frontend** | EJS (Embedded JS Templates), HTML5, CSS3 |
| **Backend** | Node.js, Express.js |
| **Database** | SQLite (lokal) + Supabase PostgreSQL (cloud) |
| **Auth** | express-session, bcryptjs |
| **Deployment** | Vercel |
| **Dev Tools** | nodemon, morgan, dotenv |

---

## 📂 Struktur Proyek

Menggunakan pola **Model-View-Controller (MVC)**:

```
📁 Daily Project 4/
├── 📁 src/
│   ├── 📁 config/
│   │   ├── auth.js             # Data akun & logika hashing password
│   │   └── database.js         # Koneksi & abstraksi Supabase / SQLite
│   ├── 📁 controllers/
│   │   ├── authController.js   # Handler login, logout
│   │   └── alumniController.js # Logika bisnis CRUD & pipeline
│   ├── 📁 middleware/
│   │   └── auth.js             # requireLogin — proteksi route
│   ├── 📁 models/
│   │   └── alumniModel.js      # Pemanggil fungsi abstraksi DB
│   └── 📁 routes/
│       └── alumniRoutes.js     # Definisi seluruh rute URL
├── 📁 views/
│   ├── 📁 partials/
│   │   ├── header.ejs          # Navbar & head HTML
│   │   └── footer.ejs          # Footer global
│   ├── index.ejs               # Halaman utama — tabel data & detail modal
│   ├── form.ejs                # Form input/edit alumni (11 field)
│   ├── login.ejs               # Halaman autentikasi admin
│   ├── laporan.ejs             # Halaman laporan & statistik
│   └── pipeline.ejs            # Dashboard verifikasi pipeline
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
| 6 | **Maintainability** | Penambahan middleware baru | Middleware terisolasi di `src/middleware/`, tidak merusak controller | ✅ Lulus |

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan akademik. Tidak untuk digunakan secara komersial.

---

<div align="center">
  <sub>Dibuat dengan ❤️ untuk Daily Project 4 — RPL UMM 2025</sub>
</div>
