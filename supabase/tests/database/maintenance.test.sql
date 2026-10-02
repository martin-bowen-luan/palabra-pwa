begin;
select no_plan();
create extension if not exists pg_cron;
select lives_ok($$select cron.schedule('palabra-local-cleanup-test','0 * * * *','select palabra_private.cleanup()')$$,'hourly cleanup can be scheduled locally');
select is((select command from cron.job where jobname='palabra-local-cleanup-test'),'select palabra_private.cleanup()','only scoped maintenance scheduled');
select lives_ok('select palabra_private.cleanup()','scheduled function runs');
select cron.unschedule('palabra-local-cleanup-test');
select * from finish();
rollback;
