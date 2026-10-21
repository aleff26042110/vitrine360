import { fitFloorplanRoom, type FloorplanRoom } from './floorplanGeometry'
import './FloorplanRoomProperties.css'

export function FloorplanRoomProperties({ room, onChange, onDelete }: {
  room: FloorplanRoom
  onChange: (room: FloorplanRoom) => void
  onDelete: () => void
}) {
  const changeNumber = (key: 'x' | 'y' | 'width' | 'height', value: string) => {
    if (!value.trim()) return
    const number = Number(value)
    if (Number.isFinite(number)) onChange(fitFloorplanRoom({ ...room, [key]: number }))
  }
  return <fieldset className="floorplan-room-properties">
    <legend>Ambiente selecionado</legend>
    <label>Nome<input value={room.name} maxLength={160} onChange={event => onChange({ ...room, name: event.target.value })} /></label>
    <div className="floorplan-number-grid">{([
      ['width', 'Largura', 5, 100], ['height', 'Altura', 5, 100],
      ['x', 'Posição horizontal', 0, 100 - room.width], ['y', 'Posição vertical', 0, 100 - room.height],
    ] as const).map(([key, label, min, max]) => <label key={key}>{label} (%)<input type="number" min={min} max={max} step={1} value={Math.round(room[key] * 10) / 10} onChange={event => changeNumber(key, event.target.value)} /></label>)}</div>
    <label>Cor do ambiente<input type="color" value={room.color} onChange={event => onChange({ ...room, color: event.target.value })} /></label>
    <small>As medidas são relativas ao quadro. Esta planta não usa escala em metros.</small>
    <button className="button button-outline full-button" onClick={onDelete}>Excluir ambiente</button>
  </fieldset>
}
