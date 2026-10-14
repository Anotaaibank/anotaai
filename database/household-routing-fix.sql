-- Remove an old secondary number from the shared master as well as the subscriber.
-- Otherwise an unassigned number would fall back to the manager's personal account.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.anota_set_household_phones(uuid,uuid,text[])'::regprocedure);
 if position('array_cat(master.allowed_phones,p_phones)' in definition)=0 then raise exception 'HOUSEHOLD_FUNCTION_UNEXPECTED';end if;
 definition:=replace(definition,'array_cat(master.allowed_phones,p_phones)','array_cat(array(select n from unnest(master.allowed_phones) n where not(n=any(member.allowed_phones)) or n=any(p_phones)),p_phones)');
 execute definition;
end $$;
