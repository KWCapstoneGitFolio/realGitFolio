from django.shortcuts import render
from .forms import RepoOverviewForm
from .utils import fetch_detailed_commit_history, analyze_commit_messages, format_analysis_md

def generate_overview(request):
    context = {}
    if request.method == "POST":
        form = RepoOverviewForm(request.POST)
        if form.is_valid():
            owner = form.cleaned_data['owner']
            repo = form.cleaned_data['repo']
            username = form.cleaned_data['username']
            count = form.cleaned_data.get('count') or 20
            try:
                commits = fetch_detailed_commit_history(owner, repo, username, count)
                analysis = analyze_commit_messages(commits)
                formatted_analysis = format_analysis_md(analysis)
                context['commits'] = commits
                context['analysis'] = formatted_analysis
            except Exception as e:
                context['error'] = str(e)
    else:
        form = RepoOverviewForm()
    
    context['form'] = form
    return render(request, "overview/summary.html", context)