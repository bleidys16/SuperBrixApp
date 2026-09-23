import { buscarOperarioDemo, OPERARIOS_DEMO } from '../src/operariosDemo';

describe('operarios de demostración', () => {
  it('incluye exactamente tres perfiles de pitch', () => {
    expect(OPERARIOS_DEMO).toHaveLength(3);
  });

  it('encuentra un operario por su cédula exacta', () => {
    expect(buscarOperarioDemo('72234621')).toEqual({
      cedula: '72234621',
      nombre: 'Juan Perez',
    });
  });

  it('acepta una cédula escrita con separadores', () => {
    expect(buscarOperarioDemo('1.098.765.432')?.nombre).toBe('Maria Gomez');
  });

  it('no asigna un nombre a una cédula desconocida', () => {
    expect(buscarOperarioDemo('99999999')).toBeNull();
  });
});
