import { buscarOperarioDemo, OPERARIOS_DEMO } from '../src/operariosDemo';

describe('operarios de demostración', () => {
  it('incluye el perfil de pitch de Maria Gomez', () => {
    expect(OPERARIOS_DEMO).toHaveLength(1);
    expect(OPERARIOS_DEMO[0].nombre).toBe('Maria Gomez');
  });

  it('encuentra un operario por su cédula exacta', () => {
    expect(buscarOperarioDemo('1098765432')).toEqual({
      cedula: '1098765432',
      nombre: 'Maria Gomez',
    });
  });

  it('acepta una cédula escrita con separadores', () => {
    expect(buscarOperarioDemo('1.098.765.432')?.nombre).toBe('Maria Gomez');
  });

  it('no asigna un nombre a una cédula desconocida', () => {
    expect(buscarOperarioDemo('99999999')).toBeNull();
  });
});
