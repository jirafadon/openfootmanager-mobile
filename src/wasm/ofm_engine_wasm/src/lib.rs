//! WebAssembly bindings for Openfoot Manager engine.
//!
//! This crate wraps the pure-Rust `ofm_core` + `engine` crates and exposes
//! every command that the React frontend used to call via Tauri `invoke()`.
//! The StateManager and in-memory game state live here; persistence is handled
//! on the JS side (IndexedDB / OPFS) via JSON serialisation.

use wasm_bindgen::prelude::*;
use serde_wasm_bindgen::{from_value, to_value};
use std::sync::{Arc, Mutex};
use std::cell::RefCell;

use ofm_core::state::StateManager;
use ofm_core::generator::{load_world_from_json, WorldData};

// ──────────────────────────────────────────────────────────────────────────
// Panic hook: redirect Rust panics to browser console
// ──────────────────────────────────────────────────────────────────────────
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
    let _ = console_log::init_with_level(log::Level::Debug);
}

// ──────────────────────────────────────────────────────────────────────────
// Shared engine state (thread-local, single-threaded WASM)
// ──────────────────────────────────────────────────────────────────────────
thread_local! {
    static STATE_MANAGER: RefCell<Option<Arc<StateManager>>> = RefCell::new(None);
}

fn with_state<F, R>(f: F) -> Result<R, JsValue>
where
    F: FnOnce(&Arc<StateManager>) -> Result<R, String>,
{
    STATE_MANAGER.with(|cell| {
        let borrow = cell.borrow();
        match borrow.as_ref() {
            Some(sm) => f(sm).map_err(|e| JsValue::from_str(&e)),
            None => Err(JsValue::from_str("be.error.noActiveSession")),
        }
    })
}

fn init_state_manager() {
    STATE_MANAGER.with(|cell| {
        let mut borrow = cell.borrow_mut();
        if borrow.is_none() {
            *borrow = Some(Arc::new(StateManager::new()));
        }
    });
}

// ──────────────────────────────────────────────────────────────────────────
// World / Game bootstrap
// ──────────────────────────────────────────────────────────────────────────

/// Load a world JSON blob and start a new game.
/// Returns the initial GameStateData as a JS object.
#[wasm_bindgen]
pub fn start_new_game(world_json: &str, options_js: JsValue) -> Result<JsValue, JsValue> {
    init_state_manager();

    let world_data: WorldData = load_world_from_json(world_json)
        .map_err(|e| JsValue::from_str(&e))?;

    #[derive(serde::Deserialize, Default)]
    #[serde(rename_all = "camelCase")]
    struct StartOptions {
        manager_first_name: Option<String>,
        manager_last_name: Option<String>,
        manager_nationality: Option<String>,
        manager_dob: Option<String>,
        team_id: Option<String>,
        start_year: Option<i32>,
        start_phase: Option<String>,
        history_depth_years: Option<u32>,
    }

    let opts: StartOptions = if options_js.is_null() || options_js.is_undefined() {
        Default::default()
    } else {
        from_value(options_js).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    with_state(|sm| {
        let game_state = sm.start_new_game_wasm(
            world_data,
            opts.manager_first_name.as_deref().unwrap_or("Player"),
            opts.manager_last_name.as_deref().unwrap_or("Manager"),
            opts.manager_nationality.as_deref().unwrap_or("England"),
            opts.manager_dob.as_deref(),
            opts.team_id.as_deref(),
            opts.start_year,
            opts.start_phase.as_deref(),
            opts.history_depth_years,
        )?;
        serde_json::to_value(&game_state)
            .map_err(|e| e.to_string())
    })
    .and_then(|v| to_value(&v).map_err(|e| JsValue::from_str(&e.to_string())))
}

/// Restore a game from a previously serialised JSON snapshot (loaded from IndexedDB).
#[wasm_bindgen]
pub fn load_game_from_snapshot(snapshot_json: &str) -> Result<JsValue, JsValue> {
    init_state_manager();
    with_state(|sm| {
        sm.load_game_from_json(snapshot_json)
            .and_then(|gs| serde_json::to_value(&gs).map_err(|e| e.to_string()))
    })
    .and_then(|v| to_value(&v).map_err(|e| JsValue::from_str(&e.to_string())))
}

/// Serialise the current in-memory game state to a JSON string for IndexedDB persistence.
#[wasm_bindgen]
pub fn export_game_snapshot() -> Result<String, JsValue> {
    with_state(|sm| {
        sm.export_game_to_json().map_err(|e| e)
    })
}

// ──────────────────────────────────────────────────────────────────────────
// Generic command dispatcher — mirrors every Tauri invoke() command
// ──────────────────────────────────────────────────────────────────────────

/// Dispatch any game command by name with a JSON payload.
/// This is the single entry point the JS `invoke()` shim calls.
///
/// Returns the result as a JS value (mirrors Tauri command return types).
#[wasm_bindgen]
pub fn invoke(command: &str, args_js: JsValue) -> Result<JsValue, JsValue> {
    // Deserialise args to serde_json::Value for routing
    let args: serde_json::Value = if args_js.is_null() || args_js.is_undefined() {
        serde_json::Value::Object(Default::default())
    } else {
        from_value(args_js.clone()).map_err(|e| JsValue::from_str(&e.to_string()))?
    };

    let result: Result<serde_json::Value, String> = with_state(|sm| {
        dispatch_command(sm, command, &args)
    });

    result
        .map_err(|e| JsValue::from_str(&e))
        .and_then(|v| to_value(&v).map_err(|e| JsValue::from_str(&e.to_string())))
}

// ──────────────────────────────────────────────────────────────────────────
// Command dispatch table
// ──────────────────────────────────────────────────────────────────────────
fn dispatch_command(
    sm: &Arc<StateManager>,
    command: &str,
    args: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    use serde_json::json;

    match command {
        // ── Settings (stored in IndexedDB on JS side; engine has defaults) ──
        "get_settings" => Ok(json!({
            "settings": sm.get_settings_json()?,
            "currency": { "code": "EUR", "symbol": "€", "exchange_rate": 1 },
            "supported_currencies": [
                { "code": "EUR", "symbol": "€", "exchange_rate": 1 },
                { "code": "GBP", "symbol": "£", "exchange_rate": 0.86 },
                { "code": "USD", "symbol": "$", "exchange_rate": 1.08 }
            ]
        })),
        "save_settings" => {
            let settings = args.get("settings").ok_or("missing settings")?;
            sm.save_settings_json(settings.clone())?;
            Ok(json!(null))
        }

        // ── Active game ──────────────────────────────────────────────────
        "get_active_game" => {
            let gs = sm.get_active_game_state_json()?;
            Ok(gs)
        }
        "exit_to_menu" => {
            sm.exit_to_menu()?;
            Ok(json!(null))
        }

        // ── Time advancement ────────────────────────────────────────────
        "advance_time_with_mode" => {
            let mode = args["mode"].as_str().unwrap_or("delegate");
            let gs = sm.advance_time_with_mode(mode)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "skip_to_match_day" => {
            let gs = sm.skip_to_match_day()?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "check_blocking_actions" => {
            let result = sm.check_blocking_actions()?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }

        // ── Squad ────────────────────────────────────────────────────────
        "set_starting_xi" => {
            let player_ids: Vec<String> = serde_json::from_value(
                args["playerIds"].clone()
            ).map_err(|e| e.to_string())?;
            let gs = sm.set_starting_xi(player_ids)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_formation" => {
            let formation = args["formation"].as_str().unwrap_or("4-4-2").to_string();
            let gs = sm.set_formation(formation)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_play_style" => {
            let style = args["playStyle"].as_str().unwrap_or("Balanced").to_string();
            let gs = sm.set_play_style(style)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_player_squad_role" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let role = args["squadRole"].as_str().ok_or("missing squadRole")?.to_string();
            let gs = sm.set_player_squad_role(player_id, role)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_player_training_focus" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let focus = args["focus"].as_str().ok_or("missing focus")?.to_string();
            let gs = sm.set_player_training_focus(player_id, focus)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_team_match_roles" => {
            let roles = args["roles"].clone();
            let gs = sm.set_team_match_roles(roles)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Training ─────────────────────────────────────────────────────
        "set_training" => {
            let payload = args.clone();
            let gs = sm.set_training(payload)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_training_groups" => {
            let groups = args["groups"].clone();
            let gs = sm.set_training_groups(groups)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_training_schedule" => {
            let schedule = args["schedule"].as_str().ok_or("missing schedule")?.to_string();
            let gs = sm.set_training_schedule(schedule)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Live match ───────────────────────────────────────────────────
        "apply_match_command" => {
            let cmd = args["command"].clone();
            let snap = sm.apply_match_command(cmd)?;
            Ok(serde_json::to_value(snap).map_err(|e| e.to_string())?)
        }
        "step_live_match" => {
            let minutes = args["minutes"].as_u64().unwrap_or(1) as u32;
            let results = sm.step_live_match(minutes)?;
            Ok(serde_json::to_value(results).map_err(|e| e.to_string())?)
        }
        "get_match_snapshot" => {
            let snap = sm.get_match_snapshot()?;
            Ok(serde_json::to_value(snap).map_err(|e| e.to_string())?)
        }
        "finish_live_match" => {
            let result = sm.finish_live_match()?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }

        // ── Messages ─────────────────────────────────────────────────────
        "mark_message_read" => {
            let id = args["messageId"].as_str().ok_or("missing messageId")?.to_string();
            let gs = sm.mark_message_read(id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "mark_all_messages_read" => {
            let gs = sm.mark_all_messages_read()?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "delete_message" => {
            let id = args["messageId"].as_str().ok_or("missing messageId")?.to_string();
            let gs = sm.delete_message(id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "delete_messages" => {
            let ids: Vec<String> = serde_json::from_value(args["messageIds"].clone())
                .map_err(|e| e.to_string())?;
            let gs = sm.delete_messages(ids)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "clear_old_messages" => {
            let gs = sm.clear_old_messages()?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "resolve_message_action" => {
            let msg_id = args["messageId"].as_str().ok_or("missing messageId")?.to_string();
            let action = args["action"].as_str().ok_or("missing action")?.to_string();
            let gs = sm.resolve_message_action(msg_id, action)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Contracts ────────────────────────────────────────────────────
        "propose_renewal" => {
            let payload = args.clone();
            let result = sm.propose_renewal(payload)?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "counter_offer" => {
            let payload = args.clone();
            let result = sm.counter_offer(payload)?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "terminate_contract_now" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let gs = sm.terminate_contract_now(player_id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "set_contract_exit_intent" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let intent = args["intent"].as_bool().unwrap_or(false);
            let gs = sm.set_contract_exit_intent(player_id, intent)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "clear_contract_exit_intent" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let gs = sm.clear_contract_exit_intent(player_id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Transfers ────────────────────────────────────────────────────
        "make_transfer_bid" => {
            let payload = args.clone();
            let result = sm.make_transfer_bid(payload)?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "respond_to_offer" => {
            let payload = args.clone();
            let result = sm.respond_to_offer(payload)?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "toggle_transfer_list" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let gs = sm.toggle_transfer_list(player_id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "toggle_loan_list" => {
            let player_id = args["playerId"].as_str().ok_or("missing playerId")?.to_string();
            let gs = sm.toggle_loan_list(player_id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "offer_free_agent_contract" => {
            let payload = args.clone();
            let result = sm.offer_free_agent_contract(payload)?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }

        // ── Staff ────────────────────────────────────────────────────────
        "hire_staff" => {
            let payload = args.clone();
            let gs = sm.hire_staff(payload)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "release_staff" => {
            let staff_id = args["staffId"].as_str().ok_or("missing staffId")?.to_string();
            let gs = sm.release_staff(staff_id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Scouting ─────────────────────────────────────────────────────
        "send_scout" => {
            let payload = args.clone();
            let gs = sm.send_scout(payload)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "start_youth_scouting" => {
            let payload = args.clone();
            let gs = sm.start_youth_scouting(payload)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "cancel_youth_scouting" => {
            let region = args["region"].as_str().ok_or("missing region")?.to_string();
            let gs = sm.cancel_youth_scouting(region)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }
        "reassign_youth_scouting" => {
            let payload = args.clone();
            let gs = sm.reassign_youth_scouting(payload)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Finances ─────────────────────────────────────────────────────
        "upgrade_facility" => {
            let facility = args["facility"].as_str().ok_or("missing facility")?.to_string();
            let gs = sm.upgrade_facility(facility)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Jobs ─────────────────────────────────────────────────────────
        "get_available_jobs" => {
            let jobs = sm.get_available_jobs()?;
            Ok(serde_json::to_value(jobs).map_err(|e| e.to_string())?)
        }
        "apply_for_job" => {
            let job_id = args["jobId"].as_str().ok_or("missing jobId")?.to_string();
            let gs = sm.apply_for_job(job_id)?;
            Ok(serde_json::to_value(gs).map_err(|e| e.to_string())?)
        }

        // ── Season ───────────────────────────────────────────────────────
        "advance_to_next_season" => {
            let result = sm.advance_to_next_season()?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }
        "get_season_awards" => {
            let awards = sm.get_season_awards()?;
            Ok(serde_json::to_value(awards).map_err(|e| e.to_string())?)
        }

        // ── Stats ────────────────────────────────────────────────────────
        "get_team_stats_overview" => {
            let team_id = args["teamId"].as_str().map(|s| s.to_string());
            let result = sm.get_team_stats_overview(team_id)?;
            Ok(serde_json::to_value(result).map_err(|e| e.to_string())?)
        }

        // ── Manager profiles (stored in IndexedDB on JS side) ────────────
        // These are forwarded to JS storage layer; engine returns acknowledgement
        "get_manager_profiles" | "save_manager_profile" | "delete_manager_profile"
        | "update_manager_profile" | "touch_manager_profile" => {
            // Handled entirely by the JS persistence layer
            Err(format!("PASSTHROUGH:{}", command))
        }

        // ── Saves (handled entirely by JS persistence layer) ─────────────
        "get_saves" | "save_game" | "load_game" | "delete_save" | "clear_all_saves"
        | "list_world_databases" | "export_world_database" | "write_temp_database" => {
            Err(format!("PASSTHROUGH:{}", command))
        }

        _ => Err(format!("be.error.unknownCommand:{}", command)),
    }
}

// ──────────────────────────────────────────────────────────────────────────
// Player stats helpers (called directly for performance)
// ──────────────────────────────────────────────────────────────────────────
#[wasm_bindgen]
pub fn get_player_advanced_stats(player_id: &str) -> Result<JsValue, JsValue> {
    with_state(|sm| {
        sm.get_player_advanced_stats(player_id)
            .and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
    })
    .and_then(|v| to_value(&v).map_err(|e| JsValue::from_str(&e.to_string())))
}

#[wasm_bindgen]
pub fn get_player_recent_matches(player_id: &str) -> Result<JsValue, JsValue> {
    with_state(|sm| {
        sm.get_player_recent_matches(player_id)
            .and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
    })
    .and_then(|v| to_value(&v).map_err(|e| JsValue::from_str(&e.to_string())))
}

#[wasm_bindgen]
pub fn get_renewal_projection(player_id: &str) -> Result<JsValue, JsValue> {
    with_state(|sm| {
        sm.get_renewal_projection(player_id)
            .and_then(|v| serde_json::to_value(v).map_err(|e| e.to_string()))
    })
    .and_then(|v| to_value(&v).map_err(|e| JsValue::from_str(&e.to_string())))
}
