import {describe,it,expect,vi,afterEach} from 'vitest'
import {createAutosave,serializeLocalWrite,saveFailureMessage} from '../src/autosave'
afterEach(()=>vi.useRealTimers())
describe('local autosave ownership',()=>{
 it('coalesces edits and flushes pending work on disposal',async()=>{
  vi.useFakeTimers();const write=vi.fn(async(_value:string)=>{}),report=vi.fn(),save=createAutosave(write,report)
  save.schedule('first');save.schedule('latest');expect(write).not.toHaveBeenCalled();await save.dispose()
  expect(write).toHaveBeenCalledExactlyOnceWith('latest');await vi.runAllTimersAsync();expect(write).toHaveBeenCalledTimes(1);expect(save.hasUnsaved()).toBe(false)
 })
 it('retains failures for an explicit retry',async()=>{
  const write=vi.fn().mockRejectedValueOnce(new DOMException('full','QuotaExceededError')).mockResolvedValueOnce(undefined),report=vi.fn(),save=createAutosave(write,report)
  save.schedule('draft');await expect(save.flush()).rejects.toThrow('full');expect(save.hasUnsaved()).toBe(true);await save.flush();expect(write).toHaveBeenLastCalledWith('draft');expect(save.hasUnsaved()).toBe(false)
  expect(saveFailureMessage(new DOMException('full','QuotaExceededError'))).toContain('Faça backup')
 })
 it('does not announce an older write as fully saved when a newer edit is pending',async()=>{
  let release!:()=>void;const report=vi.fn(),write=vi.fn().mockImplementationOnce(()=>new Promise<void>(resolve=>{release=resolve})).mockResolvedValue(undefined),save=createAutosave<string>(write,report)
  save.schedule('first');const flushing=save.flush();await Promise.resolve();save.schedule('newest');release();await flushing
  expect(report).not.toHaveBeenCalledWith('saved');await save.flush();expect(write).toHaveBeenLastCalledWith('newest');expect(report).toHaveBeenLastCalledWith('saved')
 })
 it('serializes explicit and automatic writes at each project boundary, allowing recovery after errors',async()=>{
  let release!:()=>void;const order:string[]=[]
  const first=serializeLocalWrite('project-a',()=>new Promise<void>(resolve=>{release=()=>{order.push('first');resolve()}}))
  const second=serializeLocalWrite('project-a',async()=>{order.push('second')});await Promise.resolve();await Promise.resolve();expect(order).toEqual([]);release();await Promise.all([first,second]);expect(order).toEqual(['first','second'])
  await expect(serializeLocalWrite('project-a',async()=>{throw Error('quota')})).rejects.toThrow('quota')
  await serializeLocalWrite('project-a',async()=>{order.push('recovered')});expect(order.at(-1)).toBe('recovered')
 })
})
