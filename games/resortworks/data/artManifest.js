// The locked v1.2 art list (Milestone 30, docs/RESORTWORKS_ART_LIST_v1-2.md): exactly the 300 pictures the game is drawn
// with, by key (the file is assets/images/<folder>/<key>.png). core/AssetValidator checks the manifest (data/assets.js)
// and the files on disk against it (tests/resortworks/m30.test.mjs).
// The series cast (the Works Gods, Aaron, the chibi cast and their walking sheets) is counted separately, never in the 300.
export const ART_LIST = [
  // award (12)
  'award_awr01', 'award_awr02', 'award_awr03', 'award_awr04', 'award_awr05', 'award_awr06', 'award_awr07', 'award_awr08', 'award_awr09', 'award_awr10', 'award_awr11', 'award_awr12',
  // event (12)
  'event_ev01', 'event_ev02', 'event_ev03', 'event_ev04', 'event_ev05', 'event_ev06', 'event_ev07', 'event_ev08', 'event_ev09', 'event_ev10', 'event_ev11', 'event_ev12',
  // expansion (6)
  'expansion_01', 'expansion_02', 'expansion_03', 'expansion_04', 'expansion_05', 'expansion_06',
  // facility (35)
  'facility_f01', 'facility_f02', 'facility_f03', 'facility_f04', 'facility_f05', 'facility_f06', 'facility_f07', 'facility_f08', 'facility_f09', 'facility_f10', 'facility_f11', 'facility_f12', 'facility_f13', 'facility_f14', 'facility_f15', 'facility_f16', 'facility_f17', 'facility_f18', 'facility_f19', 'facility_f20', 'facility_f21', 'facility_f22', 'facility_f23', 'facility_f24', 'facility_f25', 'facility_f26', 'facility_f27', 'facility_f28', 'facility_f29', 'facility_f30', 'facility_f31', 'facility_f32', 'facility_f33', 'facility_f34', 'facility_f35',
  // guest (24)
  'guest_gt01', 'guest_gt02', 'guest_gt03', 'guest_gt04', 'guest_gt05', 'guest_gt06', 'guest_gt07', 'guest_gt08', 'guest_gt09', 'guest_gt10', 'guest_gt11', 'guest_gt12', 'guest_gt13', 'guest_gt14', 'guest_gt15', 'guest_gt16', 'guest_gt17', 'guest_gt18', 'guest_gt19', 'guest_gt20', 'guest_gt21', 'guest_gt22', 'guest_gt23', 'guest_gt24',
  // item (24)
  'item_it01', 'item_it02', 'item_it03', 'item_it04', 'item_it05', 'item_it06', 'item_it07', 'item_it08', 'item_it09', 'item_it10', 'item_it11', 'item_it12', 'item_it13', 'item_it14', 'item_it15', 'item_it16', 'item_it17', 'item_it18', 'item_it19', 'item_it20', 'item_it21', 'item_it22', 'item_it23', 'item_it24',
  // package (10)
  'package_pk01', 'package_pk02', 'package_pk03', 'package_pk04', 'package_pk05', 'package_pk06', 'package_pk07', 'package_pk08', 'package_pk09', 'package_pk10',
  // partner (10)
  'partner_p01', 'partner_p02', 'partner_p03', 'partner_p04', 'partner_p05', 'partner_p06', 'partner_p07', 'partner_p08', 'partner_p09', 'partner_p10',
  // research (36)
  'research_r01', 'research_r02', 'research_r03', 'research_r04', 'research_r05', 'research_r06', 'research_r07', 'research_r08', 'research_r09', 'research_r10', 'research_r11', 'research_r12', 'research_r13', 'research_r14', 'research_r15', 'research_r16', 'research_r17', 'research_r18', 'research_r19', 'research_r20', 'research_r21', 'research_r22', 'research_r23', 'research_r24', 'research_r25', 'research_r26', 'research_r27', 'research_r28', 'research_r29', 'research_r30', 'research_r31', 'research_r32', 'research_r33', 'research_r34', 'research_r35', 'research_r36',
  // rival (8)
  'rival_rv01', 'rival_rv02', 'rival_rv03', 'rival_rv04', 'rival_rv05', 'rival_rv06', 'rival_rv07', 'rival_rv08',
  // room (12)
  'room_rm01', 'room_rm02', 'room_rm03', 'room_rm04', 'room_rm05', 'room_rm06', 'room_rm07', 'room_rm08', 'room_rm09', 'room_rm10', 'room_rm11', 'room_rm12',
  // staff (50)
  'staff_s01', 'staff_s02', 'staff_s03', 'staff_s04', 'staff_s05', 'staff_s06', 'staff_s07', 'staff_s08', 'staff_s09', 'staff_s10', 'staff_s11', 'staff_s12', 'staff_s13', 'staff_s14', 'staff_s15', 'staff_s16', 'staff_s17', 'staff_s18', 'staff_s19', 'staff_s20', 'staff_s21', 'staff_s22', 'staff_s23', 'staff_s24', 'staff_s25', 'staff_s26', 'staff_s27', 'staff_s28', 'staff_s29', 'staff_s30', 'staff_s31', 'staff_s32', 'staff_s33', 'staff_s34', 'staff_s35', 'staff_s36', 'staff_s37', 'staff_s38', 'staff_s39', 'staff_s40', 'staff_s41', 'staff_s42', 'staff_s43', 'staff_s44', 'staff_s45', 'staff_s46', 'staff_s47', 'staff_s48', 'staff_s49', 'staff_s50',
  // theme (9)
  'theme_th01', 'theme_th02', 'theme_th03', 'theme_th04', 'theme_th05', 'theme_th06', 'theme_th07', 'theme_th08', 'theme_th09',
  // ui (35)
  'ui_01', 'ui_02', 'ui_03', 'ui_04', 'ui_05', 'ui_06', 'ui_07', 'ui_08', 'ui_09', 'ui_10', 'ui_11', 'ui_12', 'ui_13', 'ui_14', 'ui_15', 'ui_16', 'ui_17', 'ui_18', 'ui_19', 'ui_20', 'ui_21', 'ui_22', 'ui_23', 'ui_24', 'ui_25', 'ui_26', 'ui_27', 'ui_28', 'ui_29', 'ui_30', 'ui_31', 'ui_32', 'ui_33', 'ui_34', 'ui_35',
  // world_checkin_action (1)
  'world_checkin_action',
  // world_cleaning_action (1)
  'world_cleaning_action',
  // world_event_crowd_proxy (1)
  'world_event_crowd_proxy',
  // world_guest_adult_a (1)
  'world_guest_adult_a',
  // world_guest_adult_b (1)
  'world_guest_adult_b',
  // world_guest_child (1)
  'world_guest_child',
  // world_guest_elder (1)
  'world_guest_elder',
  // world_guest_group_proxy (1)
  'world_guest_group_proxy',
  // world_guest_vip (1)
  'world_guest_vip',
  // world_pool_action (1)
  'world_pool_action',
  // world_repair_action (1)
  'world_repair_action',
  // world_serving_action (1)
  'world_serving_action',
  // world_staff_activities_base (1)
  'world_staff_activities_base',
  // world_staff_frontoffice_base (1)
  'world_staff_frontoffice_base',
  // world_staff_hospitality_base (1)
  'world_staff_hospitality_base',
  // world_staff_housekeeping_base (1)
  'world_staff_housekeeping_base',
  // world_staff_maintenance_base (1)
  'world_staff_maintenance_base',
];
// Still to draw (assets/ART_STATUS.md, 7 Nov): the 24 Staff Item icons and the Staff Items icon. Each has a code-drawn
// stand-in under its own key (src/main.js), so nothing is ever a blank box.
export const ART_STILL_TO_DRAW = [...Array.from({ length: 24 }, (_, i) => `item_it${String(i + 1).padStart(2, '0')}`), 'ui_35'];
// Filed but to be redrawn (a stray piece of the next picture): the game draws a code-made stand-in instead.
export const ART_TO_REDO = ['research_r01', 'research_r02', 'research_r03', 'research_r04', 'research_r05'];
// Series cast in this game (not in the 300): the gods' portraits and walking sheets, Aaron's still and sheet, the chibi cast.
export const SERIES_CAST = { gods: ['staff_god_bolt', 'staff_god_jinx', 'staff_god_zip', 'staff_god_kaching', 'staff_god_havoc'], godSheets: ['god_bolt_sheet', 'god_jinx_sheet', 'god_zip_sheet', 'god_kaching_sheet', 'god_havoc_sheet'], aaron: ['staff_legend_aaron', 'chibi_71_aaron_banx_games_founder_sheet'] };
