const db = require('../config/database');

class Alumni {
  static async getAll(search = '', limit = 500) { return db.getAlumni(search, limit); }
  static async getAllPaginated(search = '', page = 1, limit = 100, filters = {}) { return db.getAlumniPaginated(search, page, limit, filters); }
  static async getById(id)            { return db.getAlumniById(id); }
  static async add(data)              { return db.addAlumni(data); }
  static async update(id, data)       { return db.updateAlumni(id, data); }
  static async delete(id)             { return db.deleteAlumni(id); }
  static async getStats()             { return db.getStats(); }
  static async getProdiDistribution() { return db.getProdiDistribution(); }
  static async getTahunDistribution() { return db.getTahunDistribution(); }
  static async getPekerjaanDistribution() { return db.getPekerjaanDistribution(); }
  static async getTopCompanies(n = 10)    { return db.getTopCompanies(n); }
}

module.exports = Alumni;
