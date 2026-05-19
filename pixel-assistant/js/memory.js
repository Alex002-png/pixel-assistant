class PixelMemory {
  getProfile() {
    return JSON.parse(localStorage.getItem('pixel_profile') || '{}');
  }

  saveProfile(data) {
    const current = this.getProfile();
    localStorage.setItem('pixel_profile', JSON.stringify({ ...current, ...data }));
  }

  getHistory() {
    return JSON.parse(localStorage.getItem('pixel_history') || '[]');
  }

  pushHistory(role, content) {
    const h = this.getHistory();
    h.push({ role, content });
    if (h.length > 24) h.splice(0, h.length - 24);
    localStorage.setItem('pixel_history', JSON.stringify(h));
  }

  clearHistory() {
    localStorage.removeItem('pixel_history');
  }

  addNote(text) {
    const notes = JSON.parse(localStorage.getItem('pixel_notes') || '[]');
    notes.unshift({ text, date: new Date().toLocaleDateString('es-MX') });
    if (notes.length > 100) notes.pop();
    localStorage.setItem('pixel_notes', JSON.stringify(notes));
  }

  getNotes() {
    return JSON.parse(localStorage.getItem('pixel_notes') || '[]');
  }
}
