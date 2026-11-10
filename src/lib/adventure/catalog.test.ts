import {describe,it,expect} from 'vitest';
import {progress,QUESTS,type AdventureState} from './catalog';
const day='2026-11-10';
const state=(ids:string[]):AdventureState=>({day,week:'2026-11-09',now:`${day}T12:00:00Z`,completions:ids.map(quest_id=>({quest_id,period_id:day,completed_at:`${day}T10:00:00Z`}))});
describe('guaranteed Adventure milestones',()=>{
  it('three distinct verified quests guarantee the daily chest',()=>{expect(progress(state(['basics','ecosystem','safety'])).dailyUnlocked).toBe(true);});
  it('two never unlock three',()=>{expect(progress(state(['basics','ecosystem'])).dailyUnlocked).toBe(false);});
  it('repeating a quest never counts as distinct activity',()=>{expect(progress(state(['basics','basics','basics'])).today).toBe(1);});
  it('badges cannot recursively unlock badges',()=>{expect(progress(state(['daily_badge','weekly_badge','daily_badge'])).today).toBe(0);});
  it('five distinct weekly types unlock the fixed weekly achievement',()=>{expect(progress(state(['email','binding','basics','ecosystem','safety'])).weeklyUnlocked).toBe(true);});
  it('daily reset uses UTC server day and never carries yesterday progress',()=>{const s=state(['basics','ecosystem','safety']);s.day='2026-11-11';expect(progress(s).today).toBe(0);});
  it('first binding remains completed once but cannot qualify every day',()=>{const s=state(['binding']);s.completions[0].period_id='once';s.completions[0].completed_at='2026-11-01T10:00:00Z';expect(progress(s).today).toBe(0);});
  it('daily nonfinancial route needs no swap or referral',()=>{expect(QUESTS.filter(q=>['basics','ecosystem','safety'].includes(q.id))).toHaveLength(3);expect(progress(state(['basics','ecosystem','safety'])).dailyUnlocked).toBe(true);});
  it('unknown clicks, purchases and video views never count',()=>{expect(progress(state(['click','purchase','video_view','spin'])).today).toBe(0);});
  it('the result is deterministic',()=>{expect(progress(state(['basics','ecosystem','safety']))).toEqual(progress(state(['basics','ecosystem','safety'])));});
  it('streak counts consecutive earned UTC daily badges only',()=>{const s=state([]);s.completions=[{quest_id:'daily_badge',period_id:day,completed_at:`${day}T10:00:00Z`},{quest_id:'daily_badge',period_id:'2026-11-09',completed_at:'2026-11-09T10:00:00Z'}];expect(progress(s).streak).toBe(2);});
});