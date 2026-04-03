const db = require('../config/database');

class Alumni {
  static async getAll(search = '') {
    return await db.getAlumni(search);
  }

  static async getAllPaginated(search = '', page = 1, limit = 50) {
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
}

module.exports = Alumni;
