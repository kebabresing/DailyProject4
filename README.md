# 🎓 Alumni Tracker - Daily Project 4

**Akhmad Zamri Ardani | 202310370311406**  
**Rekayasa Kebutuhan A – Universitas Muhammadiyah Malang**

![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)

> **Sistem Informasi Manajemen & Pelacakan Profil Publik Alumni Berbasis Web Terintegrasi Cloud**
> 
> *Proyek ini dikembangkan untuk merealisasikan **Daily Project 4** dengan menambahkan manajemen data ekstensif (Sosial Media, Informasi Pekerjaan, dan Kontak Lengkap) serta integrasi Cloud Relational Database menggunakan Supabase dan Sistem Kredensial Login.*
---

## 📖 Deskripsi Sistem

**Alumni Tracker** adalah prototype sistem informasi berbasis web yang dirancang untuk membantu admin institusi/kampus dalam melacak dan mengelola data jejak karir alumni secara detail. 

Sistem ini dikembangkan dari versi sebelumnya dengan dukungan perluasan 11 titik data (*data points*) sesuai perancangan *Daily Project 4*. Semua data pada sistem dilindungi, tidak bersifat publik, dan digunakan **hanya untuk kepentingan pembelajaran**.

### Target Pengguna (Sesuai Use Case)
1. **Admin / HRD Institusi:** Bertugas login dengan akses rahasia, meninjau hasil pencarian bot otomatis, serta melakukan pemutakhiran manual terhadap profil karir alumni.

---

## ✨ Fitur Utama (Core Features DP4 Updates)

1. 🗄️ **Manajemen Profil Ekstensif (11 Entitas Baru)**
   * **Kontak Pribadi**: Terintegrasi pengelolaan data *Email* dan *No. HP/WhatsApp*.
   * **Sosial Media**: Manajemen tersentrasiliasi *LinkedIn*, *Instagram*, *Facebook*, dan *TikTok*.
   * **Manajemen Karir**: Pelacakan komprehensif atas *Tempat Kerja*, *Posisi/Jabatan*, *Alamat Tempat Bekerja*, tautan *Sosmed Kantor*.
   * **Klasifikasi Pekerjaan**: Drop-down terstandarisasi untuk klasifikasi *(PNS, Swasta, Wirausaha, dll)*.
2. 🔐 **Sistem Autentikasi Keamanan (Admin Panel)**
   * Seluruh sistem dan route manajemen data kini diproteksi (*Protected Routes*) menggunakan mekanisme `express-session` dan *hashing password* via `bcryptjs`.
3. ☁️ **Integrasi Cloud Database Ter-Desentralisasi (Supabase)**
   * Ber-migrasi dari standar *Local File Storage* menuju *PostgreSQL Cloud Management* melalui inisiasi **Supabase**. Memastikan ketersediaan *Database Master* tanpa risiko kehilangan data saat proses deployment ke **Vercel**.
4. 🤖 **Simulasi Bot Pelacak Lanjutan (Automated Scheduler)**
   * Fitur interaktif *Satu Klik* yang secara realistis mensimulasikan pencarian *(mocking API)* dan pendataan kandidat baru.
5. 📱 **Mobile Responsive dengan Interactive Detail Modal**
   * Pengecekan data detail disajikan dengan elegan melalui *Pop-Up Detail Modal* ter-animasi (glassmorphism/blur effect) cukup dengan mengklik baris data, dengan tetap mempertahankan proporsi layar *mobile HTML responsive*.

---

## 🛠️ Teknologi yang Digunakan

1. **Frontend:** EJS (Embedded Javascript Templates) + HTML5 + [TailwindCSS (CDN)](https://tailwindcss.com/)
2. **Backend:** Node.js dipadukan dengan *Framework* Express.js.
3. **Database:** Supabase (Relasional PostgreSQL Cloud Platform)

---

## 📂 Struktur Project 

Menerapkan pola desain *Model-View-Controller* (MVC) untuk kemudahan *maintenance*:

```text
📁 Daily Project 4/
├── 📁 src/
│   ├── 📁 config/
│   │   ├── auth.js             # Logic Hashing Account & Keamanan
│   │   └── database.js         # Abstraksi Mapper & Koneksi Supabase PostgresSQL
│   ├── 📁 controllers/
│   │   ├── adminController.js  # Mengelola Sesi, Login, Request Middleware
│   │   └── alumniController.js # Logika bisnis operasional CRUD
│   ├── 📁 models/
│   │   └── alumniModel.js      # Struktur pemanggil fungsi dari abstraction DB
│   └── 📁 routes/
│       └── alumniRoutes.js     # Definisi alur rute URL Protected Access
├── 📁 views/
│   ├── 📁 partials/            # Komponen Header, Footer, & Navbar
│   ├── index.ejs               # Halaman utama (Tabel Web Master) & Detail Modal
│   ├── form.ejs                # Halaman Form Dinamis (Input Kontak, Sosial Media, & Pekerjaan Lengkap)
│   ├── login.ejs               # Antarmuka Sistem Autentikasi
│   └── laporan.ejs             # Halaman Laporan & Statistik
├── .env                        # Variabel Supabase URL & Secrets
├── package.json
├── index.js                    # Entry point server Web Server Node.js
└── README.md                   # Dokumentasi teknis terperinci
```

---

## 🚀 Panduan Menjalankan Web Secara Lokal

### Cara Instalasi & Menjalankan:

1. **Unduh / Clone Repositori Ini.**
2. **Buka Terminal / Command Prompt** dan arahkan ke dalam folder proyek (`cd Daily Project 4`).
3. **Install Dependensi Penting:**
   ```bash
   npm install
   ```
4. **Siapkan File Konfigurasi Rahasia (`.env`):**
   Buat atau sesuaikan file bernama `.env` di folder *root* dan isi propertinya dengan URL serta API KEY Supabase anda:
   ```properties
   SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
   SUPABASE_KEY=YOUR_SUPABASE_ANON_KEY
   SESSION_SECRET=pilih_kalimat_rahasia_bebas
   NODE_ENV=development
   ```
5. **Jalankan Server Eksekusi:**
   ```bash
   npm start
   ```
6. **Buka Browser Anda** lalu akses alamat lokal:
   ```text
   http://localhost:3000
   ```
---

## 🧪 Pengujian Sistem (Aspek Kualitas Kinerja Baru)

Berikut adalah pengujian perancangan spesifikasi sistem terbaru di DP4:

| No | Aspek Kualitas (Standar ISO 25010) | Skenario Pengujian (Test Case) | Hasil yang Diharapkan | Status / Kesimpulan |
|:---|:---|:---|:---|:---|
| 1 | **Security** (Keamanan Data) | Mencoba akses Rute URL `/data` sebelum melakukan Login. | Sistem secara ketat menolak pengaksesan dan me- *redirect* otomatis ke halaman URL Login. | ✅ **Lulus / Sesuai** |
| 2 | **Security** (Keamanan Data) | Melakukan Bypass Password dari Database Backend. | Kombinasi karakter password terlindungi enkripsi `bcrypt` yang telah di *salt*. Peretasan sulit. | ✅ **Lulus / Sesuai** |
| 3 | **Functional Suitability** (Fungsionalitas) | Melakukan CRUD 11 data *(Sosmed, Jobs, dsb)* pada form input Alumni Baru. | Semua Field Map data dapat memetakan *camelCase* backend NodeJS tepat pada kolom *Snake_Case* Database Supabase. | ✅ **Lulus / Sesuai** |
| 4 | **Usability** (Kebergunaan) | Mengecek kelengkapan data *(Email dsb)* pada ratusan data. | Modal Popup memfasilitasi penayangan seluruh detail 18 kolom secara instan tanpa perlu menuju tab/halaman baru. | ✅ **Lulus / Sesuai** |
| 5 | **Reliability** (Keandalan) | Mamasukkan *Dummy Bot Generate* / Modul Simulator ke environment Web Publik (*Vercel*). | Tidak terjadi intervensi *filesystem readonly* dan penambahan simulasi aman menyempil di Cloud Database Supabase milik publik. | ✅ **Lulus / Sesuai** |

---
