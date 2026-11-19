from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

assets = Path(__file__).resolve().parent / "docs"

st.set_page_config(page_title="Fieldtrip Planner", page_icon="🚌", layout="wide")
planner, story = st.tabs(["Trip planner", "Watch the story"])
with planner:
    components.html(
        (assets / "index.html").read_text(encoding="utf-8"),
        height=900,
        scrolling=True,
    )
with story:
    st.video(str(assets / "story.mp4"))
