const db = require('../config/database');

class Alumni {
  static async getAll(search = '', limit = 500) {
    return await db.getAlumni(search, limit);
  }

  static async getAllPaginated(search = '', page = 1, limit = 100) {
    return await db.getAlumniPaginated(search, page, limit);
  }

  static async getById(id) {
    return await db.getAlumniById(id);
  }

  static async add(data) {
    return await db.addAlumni(data);
  }

  static async update(id, data) {
    return await db.updateAlumni(id, data);
  }

  static async delete(id) {
    return await db.deleteAlumni(id);
  }

  // ── Aggregate queries (server-side, sangat cepat untuk 100k+ data) ──
  static async getStats() {
    return await db.getStats();
  }

  static async getProdiDistribution() {
    return await db.getProdiDistribution();
  }

  static async getTahunDistribution() {
    return await db.getTahunDistribution();
  }
}

module.exports = Alumni;

