import { Subject } from 'rxjs';
import { AiJobsController } from './ai-jobs.controller';
describe('AI job notification isolation',()=>{
 it('only emits metadata for the signed-in owner and releases the subscription',()=>{
  const changes=new Subject<any>();const controller=new AiJobsController({changes} as never);const next=jest.fn();
  const stream=controller.events({user:{email:'owner@example.com',exp:Math.floor(Date.now()/1000)+60}},{setHeader:jest.fn()} as never);
  const subscription=stream.subscribe(next);
  changes.next({owner:'other@example.com',job:{id:'other',revision:2}});expect(next).not.toHaveBeenCalled();
  changes.next({owner:'owner@example.com',job:{id:'mine',revision:3,status:'succeeded'}});
  expect(next).toHaveBeenCalledWith({type:'job.updated',id:'mine:3',data:{id:'mine',revision:3,status:'succeeded'}});
  subscription.unsubscribe();expect(changes.observed).toBe(false);
 });
 it('closes the stream when the JWT expires',async()=>{
  jest.useFakeTimers();const changes=new Subject<any>();const controller=new AiJobsController({changes} as never);const complete=jest.fn();
  const subscription=controller.events({user:{email:'owner',exp:Date.now()/1000+1}},{setHeader:jest.fn()} as never).subscribe({complete});
  await jest.advanceTimersByTimeAsync(1001);expect(complete).toHaveBeenCalled();expect(changes.observed).toBe(false);subscription.unsubscribe();jest.useRealTimers();
 });
});
