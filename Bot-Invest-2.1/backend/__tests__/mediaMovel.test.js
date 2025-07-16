// Supondo que você tenha uma função mediaMovel em server.js ou modularizada
const { mediaMovel } = require('../server.js');

describe('Função mediaMovel', () => {
  beforeEach(() => {
    global.historicoPrecos = {};
  });

  it('retorna null se não houver dados suficientes', () => {
    expect(mediaMovel('BTCUSDT', 5)).toBeNull();
  });

  it('calcula corretamente a média móvel', () => {
    global.historicoPrecos['BTCUSDT'] = [10, 20, 30, 40, 50];
    expect(mediaMovel('BTCUSDT', 5)).toBe(30);
  });
});