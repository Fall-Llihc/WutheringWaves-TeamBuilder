/*
 * Ambil angka Matrix terbaru dari wuwamatrix.com untuk src/data/matrix.txt.
 *
 * Bukan bagian dari build dan tidak dijalankan dengan Node. Cara pakai:
 *   1. Buka https://wuwamatrix.com di browser.
 *   2. Tekan F12, pilih tab Console.
 *   3. Salin seluruh isi file ini, paste di Console, tekan Enter.
 *      (Chrome kadang menolak paste: ketik "allow pasting", Enter, lalu paste lagi.)
 *   4. Hasilnya tampil di Console dan otomatis tersalin ke clipboard.
 *   5. Di src/data/matrix.txt, ganti baris round, mimic_bonus, dan vigor dengan hasilnya.
 *      Baris patch dan bonus tetap diisi sendiri (datanya tidak ada di situs itu).
 *
 * Script ini hanya membaca data, tidak mengubah apa pun di situs.
 * Variabel yang dibaca: ROUNDS, PARTIAL_ROUNDS, MIMIC_KILL_BONUS_POINTS, state.roster.
 * Kalau situs mengganti nama variabel itu, script berhenti dengan ReferenceError dan perlu disesuaikan.
 * Daftar vigor diambil dari roster yang tersimpan di browser untuk situs itu, jadi perubahan vigor
 * yang pernah dibuat di sana ikut terbawa. Nama karakter harus sama dengan src/data/resonators.txt.
 */
(() => {
  const lines = [`# Dari wuwamatrix.com, ${new Date().toISOString().slice(0, 10)}`];

  // Poin per boss, satu baris per ronde
  ROUNDS.forEach((r) => lines.push(`round = ${r.bosses.join(', ')}`));
  // Ronde yang angkanya belum lengkap di situs (ditulis sebagai komentar, isi manual nanti)
  (typeof PARTIAL_ROUNDS !== 'undefined' ? PARTIAL_ROUNDS : []).forEach((r) =>
    lines.push(`# round (belum lengkap) = ${r.bosses.map((b) => b ?? '?').join(', ')}`),
  );

  lines.push('', `mimic_bonus = ${typeof MIMIC_KILL_BONUS_POINTS !== 'undefined' ? MIMIC_KILL_BONUS_POINTS : 1000}`, '');

  // Karakter dengan Vigor 2 atau lebih (Rover dilewati, di app selalu 1)
  const seen = new Set();
  ((typeof state !== 'undefined' && state.roster) || [])
    .filter((c) => (c.vigor || 1) >= 2 && !/rover/i.test(c.name))
    .forEach((c) => {
      if (seen.has(c.name)) return;
      seen.add(c.name);
      lines.push(`vigor = ${c.name} : ${c.vigor}`);
    });

  const text = lines.join('\n');
  console.log(text);
  try {
    copy(text);
    console.log('%cTersalin ke clipboard', 'color: #2e9e5b; font-weight: bold');
  } catch {
    console.log('Salin manual dari teks di atas.');
  }
  return text;
})();
