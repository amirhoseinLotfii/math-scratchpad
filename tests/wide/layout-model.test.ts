import { describe,it,expect } from 'vitest';
import { layoutAtWidth,questionStatus } from '../../src/features/workspace/model/workspace-layout';
import { actions,exerciseOf,initialState,makeStore } from '../../src/store';
describe('workspace boundaries',()=>{
 it.each([[0,'phone'],[320,'phone'],[899,'phone'],[900,'laptop'],[1024,'laptop'],[1440,'desktop'],[1199,'laptop'],[1200,'desktop'],[1599,'desktop'],[1600,'desktop'],[1920,'desktop'],[2560,'desktop']])('maps available width %s to %s',(w,l)=>expect(layoutAtWidth(Number(w))).toBe(l));
 it('does not label an untouched question as answered',()=>{const s=makeStore(initialState());s.dispatch(actions.startFractionRound());expect(questionStatus(exerciseOf(s.getState().doc))).toBe('Not started');s.dispatch(actions.setConfidence('high'));expect(questionStatus(exerciseOf(s.getState().doc))).toBe('Not started');});
 it('distinguishes draft work, explicit answer confidence and skipping',()=>{const s=makeStore(initialState());s.dispatch(actions.startFractionRound());s.dispatch(actions.command({type:'digit',value:'1'}));expect(questionStatus(exerciseOf(s.getState().doc))).toBe('Draft');s.dispatch(actions.setConfidence('high'));expect(questionStatus(exerciseOf(s.getState().doc))).toBe('Answered');s.dispatch(actions.setSkipped(true));expect(questionStatus(exerciseOf(s.getState().doc))).toBe('Skipped');});
});
