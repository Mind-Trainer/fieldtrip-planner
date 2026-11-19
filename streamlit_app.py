from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

assets = Path(__file__).resolve().parent / "docs"
st.set_page_config(page_title="Fieldtrip Planner", layout="wide")
view = st.radio("Explore Fieldtrip", ["Trip planner", "Watch the story"], horizontal=True)
if view == "Trip planner":
    components.html((assets / "index.html").read_text(encoding="utf-8"), height=900, scrolling=True)
else:
    st.video((assets / "story.mp4").read_bytes())
