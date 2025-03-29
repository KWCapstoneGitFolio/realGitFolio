from django import forms

class RepoOverviewForm(forms.Form):
    owner = forms.CharField(label="Repository Owner", max_length=100)
    repo = forms.CharField(label="Repository Name", max_length=100)
    username = forms.CharField(label="GitHub Username", max_length=100)
    count = forms.IntegerField(label="Commit Count", required=False, initial=20, min_value=1)
