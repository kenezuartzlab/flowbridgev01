import { describe, expect, it } from 'vitest';
import { groupedReviewState } from './groupedEvidenceReview';
const points=[100,100,100,100,100,100,100,100,222];
const records=points.map((points,i)=>({id:String(i),points,assessment:{exceptionAllowed:true,condition:'historical-price-missing'},review:null}));
const ids=records.map(r=>r.id);
describe('Round #3 grouped proposal',()=>{
 it('presents nine individually retained records totaling 1,022 Points',()=>{const g=groupedReviewState(records,ids);expect(g.records).toHaveLength(9);expect(g.points).toBe(1022);expect(g.canPropose).toBe(true);});
 it('blocks incomplete groups and non-valuation violations',()=>{expect(groupedReviewState(records.slice(1),ids).canPropose).toBe(false);expect(groupedReviewState(records.map((r,i)=>i===0?{...r,assessment:{...r.assessment,exceptionAllowed:false}}:r),ids).canPropose).toBe(false);});
 it('requires every record to share one evidence condition',()=>expect(groupedReviewState(records.map((r,i)=>i===0?{...r,assessment:{...r.assessment,condition:'wrong-wallet'}}:r),ids).canPropose).toBe(false));
 it('requires one group and an independent approver for every record',()=>{const proposed=records.map(r=>({...r,review:{group_id:'group',canDecide:true}}));expect(groupedReviewState(proposed,ids).canApprove).toBe(true);expect(groupedReviewState(proposed.map((r,i)=>i===0?{...r,review:{...r.review,canDecide:false}}:r),ids).canApprove).toBe(false);expect(groupedReviewState(proposed.map((r,i)=>i===0?{...r,review:{...r.review,group_id:'other'}}:r),ids).canApprove).toBe(false);});
});