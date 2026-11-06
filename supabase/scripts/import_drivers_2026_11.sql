-- =============================================================================
-- Import drivers, vehicles and truck types (driver list, Nov 2026)
--
-- Run the whole file once in the Supabase SQL Editor. It is safe to run again:
-- anything that already exists is skipped, so nothing is duplicated.
--
-- Duplicate rules used by this import:
--   * Vehicle  = plate number, ignoring spaces and case ("56967DXB" = "56967 DXB").
--                If a plate appears several times in the list, the LAST row wins
--                (its driver and truck type are used). Existing plates are never
--                overwritten; only an empty driver/truck type on them is filled in.
--   * Driver   = name (case and extra spaces ignored) + phone digits.
--                Two people with the same name but different phones (e.g. the
--                three ARIF KHANs on different trucks) stay separate drivers.
--                An existing driver with the same name and no phone gets the phone.
--   * Truck type = name, ignoring case and spaces, with REFER -> REEFER,
--                FLATBED -> FLAT BED and PICKUP -> PICK UP.
--
-- At the end it adds the same rules to the database as unique indexes, so the
-- app cannot create these duplicates later either. If duplicates ALREADY exist
-- in your data, that rule is skipped and a notice tells you which one.
-- =============================================================================

begin;

-- Clear leftovers from an earlier run in the same session (temporary tables only).
drop table if exists pg_temp.import_org, pg_temp.import_raw, pg_temp.import_latest, pg_temp.import_links;

-- 1. Which organization (company account) to import into ----------------------
create temp table import_org (id uuid not null);

do $$
declare
  v_slug text := '';   -- leave empty if you have one organization; otherwise put its slug here
  v_count int;
begin
  insert into import_org
  select id from public.organizations
  where deleted_at is null and (v_slug = '' or slug = v_slug);
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'Found % organizations. Put the slug of the one to import into in v_slug.', v_count;
  end if;
end $$;

-- 2. Helpers (temporary, dropped when the session ends) ------------------------
create or replace function pg_temp.norm_text(t text) returns text language sql immutable as
$f$ select upper(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g')) $f$;

create or replace function pg_temp.norm_type(t text) returns text language sql immutable as
$f$ select regexp_replace(regexp_replace(regexp_replace(pg_temp.norm_text(t),
     '\mREFER\M', 'REEFER', 'g'), '\mFLATBED\M', 'FLAT BED', 'g'), '\mPICKUP\M', 'PICK UP', 'g') $f$;

create or replace function pg_temp.plate_key(t text) returns text language sql immutable as
$f$ select upper(regexp_replace(coalesce(t, ''), '\s+', '', 'g')) $f$;

create or replace function pg_temp.phone_key(t text) returns text language sql immutable as
$f$ select regexp_replace(coalesce(t, ''), '\D', '', 'g') $f$;

-- 3. The list as pasted ---------------------------------------------------------
create temp table import_raw (
  line_no int primary key,
  driver_name text,
  vehicle_no text,
  truck_type text,
  phone text
);

insert into import_raw (line_no, driver_name, vehicle_no, truck_type, phone) values
  (1, 'ABRAR Khan', '60904 DXB', '15 MTR BOX', '052-7659602'),
  (2, 'AHMED KHAN', '80134 DXB', '15 MTR CURTAIN', '055-4402701'),
  (3, 'AKRAM KHAN', '67348 DXB', '15 MTR BOX', '052-9105684'),
  (4, 'ALI ASAAD SALEM', '62622 DXB', 'REFER +14', '055-7605655'),
  (5, 'ALI ZAIN', '77694 DXB', '10 TON DRY', '054-2977916'),
  (6, 'AQEEL AHMED', '78699 DXB', 'FLAT BED', '056-2030934'),
  (7, 'ARIF KHAN', '70129 DXB', '13.5 BOX', '055-1231699'),
  (8, 'ASLAM KHAN', '36621 DXB', '15 MTR BOX', '058-6363281'),
  (9, 'CHARANJIT SINGH', '53172 SHJ', '15 MTR BOX', '054-5898107'),
  (10, 'GURBAKSHINDER', '24547 DXB', 'FLAT BED', '056-2304426'),
  (11, 'IKBAL', '36348 DXB', '15 MTR BOX', '055-741671'),
  (12, 'IMRAN KHANN', '6671 DXB', '15 MTR BOX', '052-6863016'),
  (13, 'JANUS KHAN', '81216 DXB', 'REFER +14', '050-9896717'),
  (14, 'JUNAID ALI', '46186 DXB', 'FLAT BED', '055-8945665'),
  (15, 'KASHAN ALI', '63740 DXB', '10 TON DRY', '056-4960947'),
  (16, 'MANGAT RAM', '74196 SHJ', 'FLAT BED', '052-7465704'),
  (17, 'MANGAT RAM', '74196 SHJ', 'FLAT BED', '052-7465704'),
  (18, 'MOHAMMAD ESSAM', '77999 DXB', '13.5 DRY', '055-3782218'),
  (19, 'MOHAMMED RAFIK', '37034 DXB', '15 MTR BOX', '056-9051708'),
  (20, 'MUHAMMA SUFYAN', '82473 DXB', '10 TON DRY', '056-8796552'),
  (21, 'MUHAMMAD ASIF', '80231 DXB', '10 TON DRY', '056-1383047'),
  (22, 'MUHAMMAD NAEEM', '82975 DXB', 'REFER +18', '052-9345041'),
  (23, 'MUHAMMAD SUFYAN', '82473 DXB', '10 TON DRY', '056-8599652'),
  (24, 'MUHAMMAD TAYAB', '57710 DXB', '10 TON DRY', '052-5878536'),
  (25, 'Muhammad Umair', '9726 DXB', '13.5 MTR +22', '055-8312355'),
  (26, 'RAJKUMAR', '65900 DXB', '15 MTR CURTAIN', '052-3278731'),
  (27, 'RIMJAYAN ALI', '88548 DXB', '13.5 BOX', '055-5981938'),
  (28, 'SABIR', '94170 DXB', '15 MTR BOX', '052-9824977'),
  (29, 'SAJID HUSSAIN', '56147 DXB', 'FLAT BED', '055-6794184'),
  (30, 'SAKEEL KHAN', '21025 DXB', '15 MTR BOX', '056-7360122'),
  (31, 'SANWAL ILYAS', '55719 DXB', '10 TON DRY', '052-4774930'),
  (32, 'TAJINDER SINGH', '46512 DXB', 'FLAT BED', '055-9391202'),
  (33, 'TAREK AL NASER', '36169 DXB', 'REFER +14', '050-5173359'),
  (34, 'YUNUS KHAN', '71546 DXB', '15 MTR CURTAIN', '055-8292786'),
  (35, 'MUHAMMAD UMAIR AYUB', '52914 DXB', '3 TON DRY', '056-5310592'),
  (36, 'SROSH KAMRAN', '78286 DXB', 'FLAT BED', '050-5077139'),
  (37, 'NAEEM ASHRAF', '34077 DXB', 'FLAT BED', '056-4801847'),
  (38, 'AZHAR MUNIR', '4145 RK', 'FLAT BED', '056-4801847'),
  (39, 'SHAHBAJ KHAN', '93128 DXB', '13.5 BOX', '055-3850457'),
  (40, 'ALI HUSSNAIN', '91441 DXB', '10 TON DRY', '052-3548644'),
  (41, 'TARIQ HUSSAIN', '13944 DXB', 'REEFER +18', '050-7764369'),
  (42, 'WAHEED NAWAZ', '50963 DXB', 'FLAT BED', '056-2074990'),
  (43, 'ALI HAMZA', '75471 DXB', '10 TON DRY', '056-7175463'),
  (44, 'SABIR KHAN', '42316 DXB', '15 MTR BOX', '052-9824977'),
  (45, 'MUSTANSAR ALI', '20069 DXB', '3 TON DRY', '055-1594455'),
  (46, 'ALAAEDDIN NAIF', '22574 DXB', 'REEFER -18', '052-6272051'),
  (47, 'HAMMOUD ASAAD', '79433 DXB', 'REEFER -18', '055-4155883'),
  (48, 'KHALDOUN HAIDER', '56205 DXB', 'REEFER -18', '055-7198581'),
  (49, 'MOHAMMED ISMAIL', '63670 DXB', '15 MTR BOX', '055-9636842'),
  (50, 'JANGSHER KHAN', '87962 DXB', '15 MTR BOX', '058-1684127'),
  (51, 'MUBARIK KHAN', '71545 DXB', '15 MTR BOX', '056-3650386'),
  (52, 'RUP CHAND', '45905 DXB', '15 MTR BOX', '052-2489374'),
  (53, 'SAGHEER AHMED', '31537 DXB', '10 TON DRY', '050-1766132'),
  (54, 'RAJAK KHAN', '73484 DXB', '15 MTR BOX', '052-8868762'),
  (55, 'ASIF KHAN', '35392 DXB', '15 MTR BOX', '052-7940196'),
  (56, 'SAHBAJ KHAN', '58634 DXB', '15 MTR BOX', '058-8611305'),
  (57, 'AZIZ KHAN', '84737 DXB', '15 MTR BOX', '052-1626132'),
  (58, 'ARIF KHAN', '85434 DXB', '15 MTR BOX', '056-7648947'),
  (59, 'AAMIR ALI', '63583 DXB', '10 TON CURTAIN', '050-79556934'),
  (60, 'MUHAMMAD SARMAD', '93084 DXB', '10 TON DRY', '055-3187618'),
  (61, 'JABIR RASHEED', '25636 DXB', '10 TON DRY', '052-7671056'),
  (62, 'NASIR KHAN', '81355 DXB', 'FLAT BED', '055-3065801'),
  (63, 'AMJAD KHAN', '39191 DXB', '13.5 CURTAIN SIDER', '050-1271391'),
  (64, 'RAFIQ BANAJI', '20750 DXB', '13.5 CURTAIN SIDER', '058-8350124'),
  (65, 'AKBAR ALI', '84070 DXB', '13.5 CURTAIN SIDER', '052-328010'),
  (66, 'ARBAJ KHAN', '50192 DXB', '13.5 CURTAIN SIDER', '052-3087447'),
  (67, 'PRAVEJ KHAN', '37923 DXB', '13.5 CURTAIN SIDER', '055-3292378'),
  (68, 'ABID KHAN', '49974 DXB', '13.5 CURTAIN SIDER', '058-8647575'),
  (69, 'ADNAN ZAIBAN', '40349 DXB', 'REEFER +18', '055-1505240'),
  (70, 'UMAR BUTT', '39141 DXB', '10 TON DRY', '052-5587717'),
  (71, 'MOATH GHILAN', '29982 DXB', 'REEFER +18', '058-2560028'),
  (72, 'ABDUL HAQ', '74111 DXB', '10 TON DRY', '058-8226327'),
  (73, 'RAJKUMAR', '65900 DXB', '15 MTR BOX', '052-3278731'),
  (74, 'AZIZ KHAN', '84737 DXB', '15 MTR BOX', '052-1632132'),
  (75, 'AHMED KHAN', '80134 DXB', '15 MTR BOX', '055-4405997'),
  (76, 'PAPPU KHAN', '51711 DXB', '13.5 CURTAIN SIDER', '055-7065794'),
  (77, 'YUSUF MANGU', '59303 DXB', '13.5 CURTAIN SIDER', '055-7065794'),
  (78, 'ARIF KHAN', '70129 DXB', '15 MTR BOX', '055-1231699'),
  (79, 'RIMJAYAN', '88548 DXB', '15 MTR BOX', '055-5981938'),
  (80, 'ALI HAMZA', '75471 DXB', '10 TON DRY', '056-7175463'),
  (81, 'ALI HUSNAIN', '91441 DXB', '10 TON DRY', '052-3548644'),
  (82, 'RADWAN ABD', '70484 DXB', 'REEFER -18', '056-8662589'),
  (83, 'MUHAMMA UMAIR', '9726 DXB', 'REEFER -18', '055-8312355'),
  (84, 'MOHAMAD ILYAS', '45816 DXB', '15 MTR BOX', '050-5389215'),
  (85, 'TOFIK ALI', '44836 DXB', '15 MTR BOX', '050-9741130'),
  (86, 'ASLAM KHAN', '38168 DXB', '13.5 CURTAIN SIDER', '056-1917698'),
  (87, 'SIKANDER KHAN', '19150 DXB', '13.5 CURTAIN SIDER', '050-50392670'),
  (88, 'KASEM KANAKRI', '90880 DXB', 'REEFER -18', '052-5121683'),
  (89, 'IBRAHIM MANIEH', '78861 DXB', 'REEFER -18', '050-887368'),
  (90, 'ABDULLAH HUSSIEN', '17919 DXB', 'REEFER -18', '054-5764896'),
  (91, 'MUZAMMAL', '32657 DXB', 'FLAT BED', '056-6542420'),
  (92, 'GULAM ALI', '27073 DXB', '3 TON DRY', '052-6903660'),
  (93, 'MUHAMMAD ZAFAR', '33729 DXB', '10 TON DRY', '050-8057424'),
  (94, 'MUHAMMAD MUMTAZ', '93814 DXB', '10 TON DRY', '050-7704346'),
  (95, 'YANUS KHAN', '71546 DXB', '15 MTR BOX', '055-292786'),
  (96, 'GULAB KHAN', '93027 DXB', '15 MTR BOX', '055-5735905'),
  (97, 'AHMED KHAN', '80134 DXB', '15 MTR BOX', '055-44027011'),
  (98, 'YUSUF MANGU', '59303 DXB', '13.5 CURTAIN SIDER', '050-2549480'),
  (99, 'RAFIK KHAN', '17733 DXB', '15 MTR BOX', '050-2915655'),
  (100, 'RAJKUMAR', '65900 DXB', '15 MTR BOX', '052-3278731'),
  (101, 'MOHAMED RAFIQ', '67211 DXB', '15 MTR BOX', '055-8452411'),
  (102, 'RAMJAYAN ALI', '88548 DXB', '15 MTR BOX', '055-5981938'),
  (103, 'NASIR KHAN', '81355 DXB', 'FLAT BED', '055-3065801'),
  (104, 'MUHAMAD JAWAD', '56424 DXB', 'FLAT BED', '056-9453560'),
  (105, 'ALI HUSNAIN', '91441 DXB', '10 TON DRY', '052-3548644'),
  (106, 'MUZAMMAL', '32657 DXB', 'FLAT BED', '056-6542420'),
  (107, 'HARJINDER', '16461 DXB', 'FLAT BED', '052-5829047'),
  (108, 'MOHAMED IMRAN', '70080 DXB', '15 MTR BOX', '052-2120526'),
  (109, 'AHMED MUJTABA', '54437 DXB', '10 TON DRY', '056-2001475'),
  (110, 'JARNAIL SINGH', '70793 DXB', 'FLAT BED', '054-4057345'),
  (111, 'GURTEJ SINGH', '21393 DXB', 'FLAT BED', '052-1290252'),
  (112, 'HUSAM MORAD', '55388 DXB', 'REEFER -18', '052-5006720'),
  (113, 'ARIF KHAN', '46284 DXB', '15 MTR BOX', '055-7406378'),
  (114, 'MOHAMED FARUK', '65652 DXB', '15 MTR BOX', '050-3465954'),
  (115, 'MOUAYAD AHMAD', '88341 DXB', 'FLAT BED', '055-7343725'),
  (116, 'MOHAMMAD ALKALASH', '53877 DXB', 'FLAT BED', '055-2980881'),
  (117, 'TOFIK ALI', '44836 DXB', '15 MTR BOX', '055-4402701'),
  (118, 'ARIF KHAN', '70129 DXB', '15 MTR BOX', '055-4402701'),
  (119, 'AHMED KHAN', '80134 DXB', '15 MTR BOX', '055-4402701'),
  (120, 'ISHAQ ALI', '56967DXB', '15 MTR BOX', '055-4402701'),
  (121, 'MUHAMMAD JAWAD', '56424 DXB', 'FLAT BED', '056-4956560'),
  (122, 'IBRAHIM AL MAGHRABI', '65128 DXB', 'REEFER -18', '050-5149117'),
  (123, 'NASAR AHMAD', '15766 DXB', '10 TON DRY', '055-6904143'),
  (124, 'BASHEER NAJEEB', '43253 DXB', 'REEFER +20', '050-775880'),
  (125, 'JAWED AKHTAR', '45571 DXB', '10 TON DRY', '055-2610698'),
  (126, 'MUHAMMAD AMIN', '68201 DXB', '13.5 DRY', '052-4974172'),
  (127, 'MUBIEN ALI', '45391 DXB', '10 TON DRY', '056-7812062'),
  (128, 'MUZAMMAL', '32657 DXB', 'FLAT BED', '056-6542420'),
  (129, 'NASIR KHAN', '81355 DXB', 'FLAT BED', '055-3065801'),
  (130, 'MUHAMMAD TAYYAB', '28616 DXB', '3 TON', '054-3236183'),
  (131, 'AZIZ KHAN', '84737 DXB', '15 MTR BOX', '052-1626132'),
  (132, 'YUNUS KHAN', '71546 DXB', '15 MTR BOX', '055-8292786'),
  (133, 'RIMJAYAN ALI', '88548 DXB', '15 MTR BOX', '055-5981938'),
  (134, 'IMRAN K khan', '70401 DXB', '15 MTR BOX', '052-2078841'),
  (135, 'MOHAMMED ILYAS', '45816 DXB', '15 MTR BOX', '055-1483718'),
  (136, 'KINAN TARABIH', '73534 DXB', 'FLAT BED', '058-9591133'),
  (137, 'RAMI', '67404 DXB', 'FLAT BED', '0552-3567008'),
  (138, 'AHED YASSER', '82345 DXB', 'FLAT BED', '056-7288991'),
  (139, 'UMAIR', '9726 DXB', 'REEFER -18', '055-8312355'),
  (140, 'MUHAMMAD RAFI', '30584 DXB', '3 TON', '055-4312961'),
  (141, 'JAWAD HASAN', '56424 DXB', 'FLAT BED', '056-4953560'),
  (142, 'RAJKUMAR', '65900 DXB', '15 MTR BOX', '052-3278731'),
  (143, 'AHMED KHAN', '80134 DXB', '15 MTR BOX', '055-4402701'),
  (144, 'IMRAN KHAN', '45470 DXB', '15 MTR BOX', '055-4402701'),
  (145, 'AHMAD ABDUL', '80681 DXB', 'REEFER -18', '055-2832871'),
  (146, 'UMAIR', '9726 DXB', 'REEFER -18', '055-8312355'),
  (147, 'ABRAR KHAN', '60904 DXB', '15 MTR BOX', '052-7659602'),
  (148, 'MUHAMMAD MUMTAZ', '93814 DXB', '10 TON', '050-7704346'),
  (149, 'IMRAN ALI', '71850 DXB', '15 MTR BOX', '058-6652998'),
  (150, 'MUHAMMAD UMAIR', '90042 DXB', '10 TON DRY', '055-7342129'),
  (151, 'MOHAMMED AZIZ', '28287 DXB', '15 MTR BOX', '055-1258351'),
  (152, 'IMRAN KHAAN', '27099 DXB', '15 MTR BOX', '052-9824977'),
  (153, 'GULAB KHAN', '93027 DXB', '15 MTR BOX', '055-5735905'),
  (154, 'AYMAN EUNUQI', '62594 DXB', 'REEFER -18', '052-2972112'),
  (155, 'AYMAN KANKRI', '35760 DXB', 'REEFER -18', '052-3605818'),
  (156, 'KASEM KANAKRI', '90880 DXB', 'REEFER -18', '052-5121683'),
  (157, 'MOHAMMED MOTI', '84759 DXB', '15 MTR BOX', '056-5821511'),
  (158, 'ISMAILSALEH', '93378 DXB', 'REEFER -18', '055-1029295'),
  (159, 'RIZWAN KHAN', '55739 DXB', '15 MTR BOX', '052-2557786'),
  (160, 'IQBAL  MUMTAZ KHAN', '36348 DXB', '15 MTR BOX', '055-7471671'),
  (161, 'MUHAMMAD RAJJAK', '57041 DXB', '13.5 DRY', '055-1587985'),
  (162, 'ABAAS ALI KHAN', '69006 DXB', '13.5 DRY', '050-6311582'),
  (163, 'NADIM KHAN', '53285 DXB', '13.5 DRY', '055-6081323'),
  (164, 'SIKANDAR KHAN', '54573 DXB', '15 MTR BOX', '050-5170365'),
  (165, 'MOHAMMED SIKANDER', '22433 DXB', '15 MTR BOX', '050-8482385'),
  (166, 'JAGROOP SINGH', '53702 SHJ', 'REEFER -21', '056-2220840'),
  (167, 'MUHAMMAD IDREES', '46499 DXB', 'REEFER -21', '056-3542621'),
  (168, 'KHURRAM SHAHZAD', '42397 DXB', '7 TON DRY', '055-9123176'),
  (169, 'ARSHDEEP SINGH', '71313 DXB', 'FLAT BED', '055-4597015'),
  (170, 'HARSHDEEP SINGH', '51803 DXB', 'FLAT BED', '055-5403011'),
  (171, 'HARMINDER SINGH', '52615 DXB', 'FLAT BED', '056-8085835'),
  (172, 'BABU KHAN', '45438 DXB', '13.5 DRY', '055-2692814'),
  (173, 'FARHAD ULLA', '87728 DXB', '13.5 DRY', '050-1821665'),
  (174, 'AVTAR SINGH', '87031 DXB', '13.5 DRY', '052-2764433'),
  (175, 'RAVENDER SINGH', '34374 DXB', '13.5 DRY', '052-9051550'),
  (176, 'JUNAID', '68255 DXB', '13.5 DRY', '058-8692698'),
  (177, 'ABID HAMEED', '81819 DXB', '3 TON DRY', '055-3631804'),
  (178, 'ABDUL JALEL', '81612 DXB', 'REEFER -21', '052-4533420'),
  (179, 'NADEL BAHIJ', '62817 DXB', 'REEFER -21', '052-4533420'),
  (180, 'ZAFAR IQBAL', '22689 DXB', '13.5 DRY', '056-4968961'),
  (181, 'INDERJIT SINGH', '28795 DXB', '13.5 DRY', '055-6948614'),
  (182, 'MOHAMMAD ARIF KHAN', '37737 DXB', 'CURTAIN SIDER', '055-8792740'),
  (183, 'SHAFQAT RASOOL', '15472 DXB', 'FLAT BED', '056-4211549'),
  (184, 'SHABAJ KHANN', '65634 DXB', '15 MTR BOX', '058-9671517'),
  (185, 'SATTAR KHAN', '46948 DXB', '15 MTR BOX', '055-1228136'),
  (186, 'MOHAMMAD IMRAN', '71866 DXB', '10 TON DRY', '058-8240944'),
  (187, 'RAJNATH YADAV', '65092 DXB', '15 MTR BOX', '055-8296794'),
  (188, 'RATANA RAM', '34001 DXB', '15 MTR BOX', '055-8204174'),
  (189, 'ZAHID KHAN', '88527 DXB', '15 MTR BOX', '055-1794019'),
  (190, 'ZUBAIR ABBAS', '10647 DXB', '13.5 CURTAIN', '052-9758330'),
  (191, 'ASGHAR KHAN', '39637 DXB', 'FLATBED', '055-2728910'),
  (192, 'OSAMA RIDA', '85919 DXB', 'REEFER -18', '055-4730651'),
  (193, 'MAHMOUD ZIDAN', '18374 DXB', 'REEFER -18', '056-5576899'),
  (194, 'REDA HAIDAR', '15682 DXB', 'REEFER -18', '052-7652297'),
  (195, 'REFAAT NAIEF', '50882 DXB', '13.5 DRY', '055-1962632'),
  (196, 'IMRAN BUTT', '95219 DXB', '10 TON DRY', '055-8019507'),
  (197, 'YAZAN AHMAD', '18033 DXB', 'REEFER -18', '050-3692657'),
  (198, 'AHMAD ISMAEIL', '67024 DXB', 'REEFER -18', '050-3904479'),
  (199, 'AYMAN MOHAMMAD', '85288 DXB', 'REEFER -18', '050-1210350'),
  (200, 'AHMAD YOUSSAF', '31234 DXB', 'REEFER +18', '055-6760110'),
  (201, 'MOHAMMAD AHMAD ASAAD', '22542 DXB', 'REEFER +18', '058-9099252'),
  (202, 'DALBIR SINGH', '55546 SHJ', 'REEFER +18', '054-5451570'),
  (203, 'GURJANT SINGH', '17889 DXB', '15 MTR BOX', '052-8183101'),
  (204, 'SAGHIR AHMED', '38668 DXB', '3 TON DRY', '055-6230318'),
  (205, 'SARWAR KHAN', '85427 DXB', '13.5 DRY', '055-4774365'),
  (206, 'IFTIKHAR ALI', '37303 DXB', 'REEFER +20', '058-1455047'),
  (207, 'GOPAL SINGH', '64922 DXB', '15 MTR BOX', '052-6863015'),
  (208, 'ASLAM K', '58615 DXB', '15 MTR BOX', '052-8425276'),
  (209, 'AHTSHAM TARIQ', '24175 DXB', '10 TON DRY', '055-1651096'),
  (210, 'MOHAMMED ILYAS', '45816 DXB', '15 MTR BOX', '050-5389215'),
  (211, 'MOHAMMAD GHILAN', '24813 DXB', 'REEFER +20', '055-8871690'),
  (212, 'RAGHEB AL HAJI', '31416 DXB', 'REEFER +20', '052-4533002'),
  (213, 'MOHAMMAD AL SHAKRAN', '64006 DXB', 'REEFER +20', '055-4220877'),
  (214, 'OMAR AL BARAKAT', '13110 DXB', 'REEFER +20', '050-7003431'),
  (215, 'AMJAD AL JANADI', '73551 DXB', 'REEFER +20', '058-8843207'),
  (216, 'FADI YASHIN', '62622 DXB', 'REEFER +20', '058-6366501'),
  (217, 'HUSSAM AL EAZ', '69348 DXB', 'REEFER +20', '055-7590091'),
  (218, 'AHMAD HASAN', '65066 DXB', 'REEFER +18', '058-8648986'),
  (219, 'MOHAMMAD KHALED', '90880 DXB', 'REEFER +18', '055-4238451'),
  (220, 'ESMAEEL HASAN', '88167 DXB', 'REEFER +18', '052-1190565'),
  (221, 'GUL SHAHID', '25687 DXB', '15 MTR BOX', '052-4545995'),
  (222, 'ARIF ALI', '64432 DXB', '15 MTR BOX', '054-5462986'),
  (223, 'NAVEED AFZAL', '54969 DXB', '10 TON DRY', '056-2536301'),
  (224, 'AMJAD ABD', '68995 DXB', 'REEFER +18', '052-6182190'),
  (225, 'KHALED ZAKI', '59327 DXB', 'REEFER +18', '050-4823214'),
  (226, 'BELAL MOUAFAK', '89868 DXB', 'REEFER +18', '058-1433189'),
  (227, 'YASSER NASER', '61664 DXB', 'REEFER +18', '055-1994588'),
  (228, 'OSAMA HEJAZI', '76945 DXB', 'REEFER +18', '055-1815583'),
  (229, 'SALAH ASAAD', '19331 DXB', '13.5 DRY', '052-4911341'),
  (230, 'ALI ISMAIEL', '63130 DXB', '13.5 DRY', '052-8627603'),
  (231, 'SAMIR MOHAMMAD', '17189 DXB', '13.5 DRY', '052-2415922'),
  (232, 'SAMI ASAAD', '41336 DXB', '13.5 DRY', '058-2601433'),
  (233, 'SHAHIN ALI', '83219 DXB', '13.5 DRY', '052-2137455'),
  (234, 'BASHAR HASSAN', '79806 DXB', '13.5 DRY', '055-8945430'),
  (235, 'MARWAN ZEN', '68598 DXB', '13.5 DRY', '052-1907793'),
  (236, 'MUHAMMAD ASIM', '11750 DXB', '13.5 MTR CURTAIN', '055-2400258'),
  (237, 'UMER SHAHZAD', '61764 DXB', '13.5 MTR CURTAIN', '050-7496983'),
  (238, 'AHMAD ABDELGHANI', '42351 DXB', 'REEFER +18', '052-1037790'),
  (239, 'ISSAM AL KHATIB', '78949 DXB', 'REEFER +18', '052-2069924'),
  (240, 'IRSHAD KHAN', '71603 DXB', '15 MTR BOX', '052-5816836'),
  (241, 'SALIM KAZEM', '49234 DXB', 'REEFER +18', '056-6558293'),
  (242, 'ABAAS ALI', '43795 DXB', '15 MTR BOX', '052-8762070'),
  (243, 'MAZEN GHAILAN', '50746 DXB', 'REEFER +18', '053-9652867'),
  (244, 'UMER FAROOQ', '92521 DXB', '15 MTR BOX', '055-7990072'),
  (245, 'REFAT GHAILAN', '70484 DXB', 'REEFER +18', '055-3317065'),
  (246, 'MOHAMMED ZAIN', '93897 DXB', 'REEFER +18', '052-8806812'),
  (247, 'MOHAMAD ABDULKARIM', '53659 DXB', 'DRY REFER BOX', '050-7842698'),
  (248, 'TAHA KHALAF', '17138 DXB', 'DRY REFER BOX', '050-9220492'),
  (249, 'AAMN ABO', '62132 DXB', 'DRY REFER BOX', '056-4471775'),
  (250, 'AHMAD ABO', '89104 DXB', 'DRY REFER BOX', '058-8124808'),
  (251, 'MUHAMMAD AMJAD', '52617 DXB', '10 TON DRY', '055-9274625'),
  (252, 'ISMAIL MANIEH', '42879 DXB', 'REEFER BOX', '055-4512256'),
  (253, 'TALIB HUSSAIN', '25265 DXB', '15 MTR BOX', '052-6450957'),
  (254, 'FARHAN KHAN', '69176 DXB', '15 MTR BOX', '055-8788710'),
  (255, 'MUHAMMAD MUNIR', '88158 DXB', '3 TON PICK UP', '056-3462080'),
  (256, 'MUHAMMAD WAQAS', '26879 DXB', '10 TON DRY', '055-5277395'),
  (257, 'AYMAN YASSIN', '81862 DXB', 'REEFER +14', '052-7710082'),
  (258, 'FAISAL KHAN', '16056 DXB', 'FLAT BED', '055-8551162'),
  (259, 'NAYEF ALLAHAM', '35826 DXB', 'REEFER +14', '058-2989230'),
  (260, 'MUHAMMED UMAIR', '90042 DXB', '10 TON DRY', '055-7342129'),
  (261, 'SHAFIQ AHMED', '27253 DXB', '3 TON PICK UP', '050-5743580'),
  (262, 'BASSAM ALEAZ', '88066 DXB', 'DRY REFER BOX', '052-6430330'),
  (263, 'ALI ALEAZ', '63850 DXB', 'DRY REFER BOX', '055-8913213'),
  (264, 'AZHAR ILYAS', '44153 DXB', '7 TON DRY', '050-9773094'),
  (265, 'AMER ABDULKADER', '19528 DXB', 'REEFER +18', '052-5461120'),
  (266, 'AMMAR FARWAH', '42782 DXB', 'REEFER +18', '052-2474523'),
  (267, 'BASHARAT KHAN', '49212 DXB', '3 TON PICKUP', '052-92344749'),
  (268, 'ALI ZAINEDDIN', '72189 DXB', 'DRY REFER BOX', '055-4597325'),
  (269, 'MOSTAFA', '95145 DXB', 'DRY REFER BOX', '058-8367790'),
  (270, 'MARWAN MUAMAR', '28191 DXB', 'REEFER +18', '052-5887599'),
  (271, 'AHMAD ALYATIM', '95062 DXB', 'REEFER +18', '055-7894882'),
  (272, 'RAFAT AL YATIM', '50147 DXB', 'REEFER +18', '058-2375488'),
  (273, 'MOHAMMAD DIB BADRIA', '91781 DXB', 'REEFER +18', '058-1948758'),
  (274, 'ALAA ZAINAB', '95268 DXB', 'DRY REFER BOX', '050-9379291'),
  (275, 'ALAA ALEAZ', '69348 DXB', 'DRY REFER BOX', '050-9379291'),
  (276, 'OMAR ZAIN EDDIN', '21650 DXB', 'REEFER +18', '058-8157512'),
  (277, 'YUNUS K KHAN', '40047 DXB', '15 MTR BOX', '054-3416087'),
  (278, 'EZ EDDIN MOHAMED', '96178 DXB', 'REEFER +18', '055-4560025'),
  (279, 'IMTIAZ ALI', '75015 DXB', '15 MTR BOX', '054-5750915'),
  (280, 'ASAAD KANAKRI', '70669 DXB', 'DRY REFER BOX', '052-3713726'),
  (281, 'MUSTAFA ABD KAREM', '50927 DXB', 'DRY REFER BOX', '058-8261620'),
  (282, 'ABOU BAKR', '11390 DXB', '13.5 CURTAIN SIDER', '055-9904389'),
  (283, 'TANVEER ANWAR', '11296 DXB', '10 TON DRY', '050-8303759'),
  (284, 'MAHMOUD MUSAFAH', '32896 DXB', 'REEFER +18', '050-8303759'),
  (285, 'BASHARAT ALI', '53400 DXB', '7 TON DRY', '056-1226908'),
  (286, 'ISMAAIL ALLAHAM', '28871 DXB', 'REEFER +18', '052-4466105'),
  (287, 'ABDUL GHAFAR', '25570 DXB', '15 MTR BOX', '052-2833439'),
  (288, 'MUHAMMAD HASNAIN', '58036 DXB', '3 TON DRY', '054-3149679'),
  (289, 'MUHAMMAD AJMAL', '34207 DXB', '7 TON DRY', '050-5412751'),
  (290, 'MOHAMAD ABDULRAHMAN', '39573 DXB', 'REEFER +18', '052-7857791'),
  (291, 'OMAR SAMIR', '87878 DXB', 'REEFER +18', '058-8852970'),
  (292, 'MAJD AL SHARKAWI', '55659 DXB', 'REEFER +18', '056-2946248'),
  (293, 'AHMAD DIB', '60420 DXB', 'REEFER +18', '058-5051400'),
  (294, 'ABDUL RASHEED', '56649 DXB', '15 MTR BOX', '055-3471983'),
  (295, 'MOHAMMED JAVED KHAN', '77195 DXB', '15 MTR BOX', '058-2703734'),
  (296, 'OTHMAN OSMAIL', '68501 DXB', 'REEFER +20', '052-3613023'),
  (297, 'NASER NASER EDDIN', '82501 DXB', 'REEFER +20', '058-6552060'),
  (298, 'MOHAMMAD AL SKAF', '33835 DXB', 'REEFER +20', '052-8827137'),
  (299, 'MUHAMMAD USMAN', '72357 DXB', '10 TON DRY', '052-1477233'),
  (300, 'MOHAMED AL SAKAF', '23763 DXB', 'REEFER +18', '058-2236502'),
  (301, 'FERAS FARAH', '52549 DXB', 'REEFER +18', '056-6473909'),
  (302, 'MAZHAR DAMEN', '41483 DXB', 'REEFER +18', '052-2911031'),
  (303, 'WARD AMIN', '43585 DXB', 'REEFER +18', '056-3481260'),
  (304, 'OMRAN DIB', '29035 DXB', 'REEFER +18', '052-6700397'),
  (305, 'SHABIR ALI', '26871 DXB', '15 MTR BOX', '055-2362763'),
  (306, 'GHULAM ALI', '27073 DXB', '3 TON DRY', '052-6903660'),
  (307, 'AHMAD ZAIN EDDIN', '69234 DXB', 'REEFER +18', '055-2854061'),
  (308, 'IMRAN KHAN N', '35162 DXB', '15 MTR BOX', '055-8692080'),
  (309, 'BILAL MANZOOR', '2338 DXB', '10 TON DRY', '050-2093550'),
  (310, 'JANGSHER ALI', '28899 DXB', '15 MTR BOX', '050-2159918');

-- 4. Clean it up and keep one row per truck (the last one in the list) ---------
create temp table import_latest as
select distinct on (pg_temp.plate_key(vehicle_no))
  line_no,
  pg_temp.norm_text(driver_name) as driver_name,
  regexp_replace(pg_temp.norm_text(vehicle_no), '^(\d+)\s*([A-Z]+)$', '\1 \2') as vehicle_no,
  pg_temp.norm_type(truck_type) as truck_type,
  nullif(btrim(phone), '') as phone
from import_raw
order by pg_temp.plate_key(vehicle_no), line_no desc;

-- 5. Truck types ------------------------------------------------------------------
insert into public.truck_types (organization_id, name)
select distinct o.id, l.truck_type
from import_latest l
cross join import_org o
where l.truck_type <> ''
  and not exists (
    select 1 from public.truck_types t
    where t.organization_id = o.id and t.deleted_at is null
      and pg_temp.norm_type(t.name) = l.truck_type
  );

-- 6. Drivers ---------------------------------------------------------------------
-- 6a. Existing driver with the same name but no phone: fill in the phone
--     (only when the list has exactly one phone for that name).
update public.drivers d
set phone = l.phone
from import_latest l, import_org o
where d.organization_id = o.id
  and d.deleted_at is null
  and coalesce(btrim(d.phone), '') = ''
  and pg_temp.norm_text(d.name) = l.driver_name
  and l.phone is not null
  and (select count(distinct pg_temp.phone_key(x.phone)) from import_latest x where x.driver_name = l.driver_name) = 1;

-- 6b. New drivers (name + phone not already there)
insert into public.drivers (organization_id, name, phone)
select distinct on (l.driver_name, pg_temp.phone_key(l.phone))
  o.id, l.driver_name, l.phone
from import_latest l
cross join import_org o
where not exists (
  select 1 from public.drivers d
  where d.organization_id = o.id and d.deleted_at is null
    and pg_temp.norm_text(d.name) = l.driver_name
    and pg_temp.phone_key(d.phone) = pg_temp.phone_key(l.phone)
)
order by l.driver_name, pg_temp.phone_key(l.phone), l.line_no desc;

-- 7. Vehicles --------------------------------------------------------------------
create temp table import_links as
select
  l.*,
  o.id as organization_id,
  (select t.id from public.truck_types t
     where t.organization_id = o.id and t.deleted_at is null and pg_temp.norm_type(t.name) = l.truck_type
     order by t.created_at limit 1) as truck_type_id,
  (select d.id from public.drivers d
     where d.organization_id = o.id and d.deleted_at is null
       and pg_temp.norm_text(d.name) = l.driver_name
       and pg_temp.phone_key(d.phone) = pg_temp.phone_key(l.phone)
     order by d.created_at limit 1) as driver_id
from import_latest l
cross join import_org o;

-- 7a. Existing vehicles: only fill in a missing driver / truck type
update public.vehicles v
set driver_id = coalesce(v.driver_id, k.driver_id),
    truck_type_id = coalesce(v.truck_type_id, k.truck_type_id)
from import_links k
where v.organization_id = k.organization_id
  and v.deleted_at is null
  and pg_temp.plate_key(v.vehicle_number) = pg_temp.plate_key(k.vehicle_no)
  and (v.driver_id is null or v.truck_type_id is null);

-- 7b. New vehicles (plate not already there, including deleted ones)
insert into public.vehicles (organization_id, vehicle_number, truck_type_id, driver_id)
select k.organization_id, k.vehicle_no, k.truck_type_id, k.driver_id
from import_links k
where not exists (
  select 1 from public.vehicles v
  where v.organization_id = k.organization_id
    and pg_temp.plate_key(v.vehicle_number) = pg_temp.plate_key(k.vehicle_no)
);

-- 8. Duplicate rules for the future ---------------------------------------------
do $$
begin
  if exists (
    select 1 from public.drivers where deleted_at is null
    group by organization_id, upper(regexp_replace(btrim(name), '\s+', ' ', 'g')), regexp_replace(coalesce(phone, ''), '\D', '', 'g')
    having count(*) > 1
  ) then
    raise notice 'Driver duplicate rule NOT added: some drivers already share the same name and phone. Clean those up, then run this block again.';
  else
    create unique index if not exists drivers_org_name_phone_unique
      on public.drivers (organization_id, upper(regexp_replace(btrim(name), '\s+', ' ', 'g')), regexp_replace(coalesce(phone, ''), '\D', '', 'g'))
      where deleted_at is null;
  end if;

  if exists (
    select 1 from public.truck_types where deleted_at is null
    group by organization_id, upper(regexp_replace(btrim(name), '\s+', ' ', 'g'))
    having count(*) > 1
  ) then
    raise notice 'Truck type duplicate rule NOT added: some truck types already share the same name.';
  else
    create unique index if not exists truck_types_org_name_unique
      on public.truck_types (organization_id, upper(regexp_replace(btrim(name), '\s+', ' ', 'g')))
      where deleted_at is null;
  end if;

  if exists (
    select 1 from public.vehicles
    group by organization_id, upper(regexp_replace(vehicle_number, '\s+', '', 'g'))
    having count(*) > 1
  ) then
    raise notice 'Vehicle duplicate rule NOT added: some plates differ only by spaces/case.';
  else
    create unique index if not exists vehicles_org_plate_key_unique
      on public.vehicles (organization_id, upper(regexp_replace(vehicle_number, '\s+', '', 'g')));
  end if;
end $$;

commit;

-- 9. Summary (shown in the results panel) ----------------------------------------
select
  (select count(*) from import_raw)                                   as rows_in_list,
  (select count(*) from import_latest)                                as unique_trucks_in_list,
  (select count(*) from public.drivers d join import_org o on o.id = d.organization_id where d.deleted_at is null)     as drivers_total_now,
  (select count(*) from public.vehicles v join import_org o on o.id = v.organization_id where v.deleted_at is null)    as vehicles_total_now,
  (select count(*) from public.truck_types t join import_org o on o.id = t.organization_id where t.deleted_at is null) as truck_types_total_now;
