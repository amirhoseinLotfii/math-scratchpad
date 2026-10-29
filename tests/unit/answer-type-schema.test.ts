import {describe,it,expect} from 'vitest';
import {BANK_SCHEMA,validateBank,bankDocument} from '../../src/features/drive-bank/drive-bank';
import {answerTypeOf} from '../../src/model';
import {makeStore,initialState,actions} from '../../src/store';
import {serialize,validateSession} from '../../src/persistence';
const bank=(extra:Record<string,unknown>={})=>({schema_version:BANK_SCHEMA,bank_id:'a',version:'1',questions:[{id:'q',mode:'text',source:'4,035',...extra}]});
describe('optional response metadata compatibility',()=>{
 it('defaults old banks without response metadata according to question mode',()=>{expect(answerTypeOf(bankDocument(validateBank(bank()),'1').exercises[0])).toBe('text');expect(answerTypeOf(bankDocument(validateBank(bank({mode:'math',source:'1/2'})),'1').exercises[0])).toBe('math');});
 it.each([{answerType:'bad'},{answerType:'choice'},{answerType:'choice',choices:['<','<']},{answerType:'choice',choices:[]},{answerType:'choice',choices:[1,2]}])('rejects invalid metadata %o',extra=>expect(()=>validateBank(bank(extra))).toThrow());
 it('continues rejecting bank answers while accepting answerType metadata',()=>{expect(()=>validateBank(bank({answerType:'text'}))).not.toThrow();expect(()=>validateBank(bank({answer:'four'}))).toThrow();});
 it('loads old version 2 backups without adding response fields or altering math steps',()=>{const store=makeStore(initialState());const saved=JSON.parse(serialize(store.getState()));const restored=validateSession(saved);expect(restored.doc.exercises).toEqual(saved.doc.exercises);expect(restored.doc.exercises[0]).not.toHaveProperty('answerText');expect(saved.version).toBe(2);});
 it('rejects a saved selection outside its choice list',()=>{const store=makeStore(initialState());store.dispatch(actions.load({doc:bankDocument(validateBank(bank({answerType:'choice',choices:['<','>']})),'1')}));const saved=JSON.parse(serialize(store.getState()));saved.doc.exercises[0].answerText='=';expect(()=>validateSession(saved)).toThrow();});
});
