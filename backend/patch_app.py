"""Patch app.py to add Lite Agent Mode for file/image generation without SSH."""
import re

with open("app.py", "r") as f:
    code = f.read()

# ═══ PATCH 1: Add file_keywords after analysis_keywords ═══
old_block1 = '''    msg_lower = user_message.lower()
    is_analysis = any(kw in msg_lower for kw in analysis_keywords)
    is_agent_task = any(kw in msg_lower for kw in agent_keywords)

    # If it looks like analysis/review AND no explicit SSH in message — prefer chat mode
    if is_analysis and not ssh_from_msg:
        is_agent_task = False

    # If SSH credentials were parsed from message — it's definitely an agent task
    if ssh_from_msg:
        is_agent_task = True

    # Also check if SSH credentials are configured
    has_ssh = bool(ssh_credentials.get("host") and ssh_credentials.get("password"))'''

new_block1 = '''    # Keywords that indicate file/document generation — needs Lite Agent Mode (no SSH required)
    file_keywords = [
        "ворд", "word", "docx", ".docx", "документ", "отчёт", "отчет",
        "pdf", ".pdf", "пдф",
        "excel", "xlsx", ".xlsx", "таблиц", "эксель",
        "скачать", "скачай", "скачивание", "download",
        "файл создай", "создай файл", "сделай файл", "сгенерируй файл",
        "дай скачать", "дай файл", "дай документ",
        "сделай из этого", "сохрани как", "экспортируй",
        "картинк", "изображен", "диаграмм", "график", "chart",
        "generate file", "create document", "make pdf", "make word",
        "markdown файл", ".md файл", "html файл",
        "csv", ".csv", "json файл",
        "размести", "ссылку на скачивание", "ссылк",
        "прототип", "макет", "мокап", "mockup",
    ]

    msg_lower = user_message.lower()
    is_analysis = any(kw in msg_lower for kw in analysis_keywords)
    is_agent_task = any(kw in msg_lower for kw in agent_keywords)
    is_file_task = any(kw in msg_lower for kw in file_keywords)

    # If it looks like analysis/review AND no explicit SSH in message — prefer chat mode
    # BUT if it also asks for file generation — allow lite agent mode
    if is_analysis and not ssh_from_msg and not is_file_task:
        is_agent_task = False

    # If SSH credentials were parsed from message — it's definitely an agent task
    if ssh_from_msg:
        is_agent_task = True

    # Also check if SSH credentials are configured
    has_ssh = bool(ssh_credentials.get("host") and ssh_credentials.get("password"))

    # Lite Agent Mode: file/image generation without SSH
    is_lite_agent = is_file_task and not has_ssh and not is_agent_task'''

assert old_block1 in code, "PATCH 1: old block not found!"
code = code.replace(old_block1, new_block1, 1)
print("PATCH 1 applied: file_keywords + is_lite_agent")

# ═══ PATCH 2: Update metadata line ═══
old_meta = '''        active_model_name = agent_model_name if (is_agent_task and has_ssh) else model_name
        yield f"data: {json.dumps({'type': 'meta', 'variant': variant, 'model': active_model_name, 'enhanced': enhanced, 'agent_mode': is_agent_task and has_ssh})}\\n\\n"'''

new_meta = '''        active_model_name = agent_model_name if (is_agent_task and has_ssh) or is_lite_agent else model_name
        yield f"data: {json.dumps({'type': 'meta', 'variant': variant, 'model': active_model_name, 'enhanced': enhanced, 'agent_mode': (is_agent_task and has_ssh) or is_lite_agent})}\\n\\n"'''

assert old_meta in code, "PATCH 2: old meta not found!"
code = code.replace(old_meta, new_meta, 1)
print("PATCH 2 applied: updated metadata")

# ═══ PATCH 3: Add Lite Agent Mode before Agent Mode ═══
old_agent = '''        if is_agent_task and has_ssh:
            # ═══ AGENT MODE: Real execution with SSH/Browser/Files ═══
            yield f"data: {json.dumps({'type': 'agent_mode', 'text': 'Запускаю автономный агент...'})}\\n\\n"'''

new_agent = '''        if is_lite_agent:
            # ═══ LITE AGENT MODE: File/Image generation without SSH ═══
            yield f"data: {json.dumps({'type': 'agent_mode', 'text': 'Генерирую файл...'})}\\n\\n"

            agent = AgentLoop(
                model=agent_model,
                api_key=OPENROUTER_API_KEY,
                api_url=OPENROUTER_BASE_URL,
                ssh_credentials={}  # No SSH needed for file generation
            )

            with _agents_lock:
                _active_agents[chat_id] = agent

            try:
                for event in agent.run_stream(user_message, history, file_content):
                    yield event
                    try:
                        event_data = json.loads(event.replace("data: ", "").strip())
                        if event_data.get("type") == "content":
                            full_response += event_data.get("text", "")
                    except:
                        pass

                tokens_in = agent.total_tokens_in
                tokens_out = agent.total_tokens_out

            finally:
                with _agents_lock:
                    _active_agents.pop(chat_id, None)

        elif is_agent_task and has_ssh:
            # ═══ AGENT MODE: Real execution with SSH/Browser/Files ═══
            yield f"data: {json.dumps({'type': 'agent_mode', 'text': 'Запускаю автономный агент...'})}\\n\\n"'''

assert old_agent in code, "PATCH 3: old agent block not found!"
code = code.replace(old_agent, new_agent, 1)
print("PATCH 3 applied: Lite Agent Mode added")

# ═══ PATCH 4: Update assistant_msg to include lite agent ═══
old_agent_mode = '''            "agent_mode": is_agent_task and has_ssh
        }
        chat2["messages"].append(assistant_msg)'''

new_agent_mode = '''            "agent_mode": (is_agent_task and has_ssh) or is_lite_agent
        }
        chat2["messages"].append(assistant_msg)'''

if old_agent_mode in code:
    code = code.replace(old_agent_mode, new_agent_mode, 1)
    print("PATCH 4 applied: updated assistant_msg agent_mode")
else:
    print("PATCH 4 skipped: pattern not found (may already be correct)")

# ═══ PATCH 5: Update memory agent_mode ═══
old_memory = '''            "agent_mode": is_agent_task and has_ssh,'''
new_memory = '''            "agent_mode": (is_agent_task and has_ssh) or is_lite_agent,'''

if old_memory in code:
    code = code.replace(old_memory, new_memory, 1)
    print("PATCH 5 applied: updated memory agent_mode")
else:
    print("PATCH 5 skipped: pattern not found")

# ═══ Write patched file ═══
with open("app.py", "w") as f:
    f.write(code)

print("\nAll patches applied successfully!")
