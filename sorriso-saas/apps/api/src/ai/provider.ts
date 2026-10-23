export type Treatment = 'lentes' | 'clareamento' | 'alinhadores';

/** Retângulo da boca em fração da imagem (0..1). */
export interface MouthRect { x: number; y: number; w: number; h: number }

export interface SimulationInput {
  photo: Buffer; // JPEG/PNG já orientado
  treatment: Treatment;
  mouth: MouthRect;
}

export interface AiProvider {
  name: string;
  simulate(input: SimulationInput): Promise<Buffer>; // JPEG
}
